/**
 * NextAuth Configuration
 * 
 * This file configures NextAuth with:
 * - PostgreSQL adapter via Prisma
 * - Email magic link authentication
 * - Custom NIP07 Nostr browser extension authentication
 * - Anonymous authentication with generated Nostr keypairs
 * - GitHub OAuth authentication
 * - Ephemeral Nostr keypair generation for non-Nostr accounts
 * - Configurable settings via config/auth.json
 * 
 * DUAL AUTHENTICATION ARCHITECTURE:
 * ================================
 * 
 * This system supports TWO distinct authentication paradigms:
 * 
 * 🔵 NOSTR-FIRST ACCOUNTS (Nostr as identity source):
 * --------------------------------------------------
 * • NIP07 Authentication (nostr provider)
 * • Anonymous Authentication (anonymous provider)
 * 
 * Behavior:
 * - Nostr profile is the SOURCE OF TRUTH for user data
 * - Profile sync happens on every login from Nostr relays
 * - Database user fields are updated if Nostr profile differs
 * - User's Nostr identity drives their platform identity
 * 
 * 🟠 OAUTH-FIRST ACCOUNTS (Platform as identity source):
 * -----------------------------------------------------
 * • Email Authentication (email provider)
 * • GitHub Authentication (github provider)
 * 
 * Behavior:
 * - OAuth profile is the SOURCE OF TRUTH for user data
 * - Ephemeral Nostr keypairs generated for background Nostr functionality
 * - No profile sync from Nostr - OAuth data takes precedence
 * - Platform identity drives their Nostr identity (not vice versa)
 * 
 * TECHNICAL IMPLEMENTATION:
 * ========================
 * 
 * All users get Nostr capabilities, but the data flow differs:
 * 
 * 1. NOSTR-FIRST (NIP07 & Anonymous):
 *    - Profile metadata flows: Nostr → Database
 *    - Database acts as cache of Nostr profile
 *    - Changes to Nostr profile automatically sync to platform
 * 
 * 2. OAUTH-FIRST (Email & GitHub):
 *    - Profile metadata flows: OAuth Provider → Database
 *    - Ephemeral Nostr keys generated for protocol participation
 *    - No automatic sync from Nostr (OAuth data is authoritative)
 * 
 * SECURITY & PRIVACY:
 * ===================
 * 
 * - Nostr-first: Private keys managed by user (NIP07) or platform (anonymous)
 * - OAuth-first: Ephemeral private keys stored encrypted in database
 * - Session privkey only exposed for accounts that need client-side signing
 * - Provider tracking ensures correct key handling per account type
 */

import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import EmailProvider from 'next-auth/providers/email'
import CredentialsProvider from 'next-auth/providers/credentials'
import GitHubProvider from 'next-auth/providers/github'
import { prisma } from './prisma'
import type { Adapter } from 'next-auth/adapters'
import { generateKeypair, decodePrivateKey, getPublicKey } from 'snstr'
import authConfig from '../../config/auth.json'
import { 
  isNostrFirstProvider, 
  isOAuthFirstProvider, 
  getProfileSourceForProvider,
  shouldSyncFromNostr 
} from './account-linking'
import { fetchNostrProfile, syncUserProfileFromNostr } from './nostr-profile'
import { encryptPrivkey, decryptPrivkey } from './privkey-crypto'

/**
 * Verify NIP07 public key format
 */
function verifyNostrPubkey(pubkey: string): boolean {
  // Check if it's a valid hex string of 64 characters (32 bytes)
  return /^[a-f0-9]{64}$/i.test(pubkey)
}

/**
 * Generate anonymous user data with random defaults
 */
function generateAnonymousUserData(pubkey: string) {
  const shortPubkey = pubkey.substring(0, authConfig.providers.anonymous.usernameLength)
  const username = `${authConfig.providers.anonymous.usernamePrefix}${shortPubkey}`
  const avatar = `${authConfig.providers.anonymous.defaultAvatar}${pubkey}`
  
  return {
    username,
    avatar
  }
}

/**
 * Look up an existing ephemeral user (anonymous/email/github) using a persisted private key
 * This is primarily used to let anonymous accounts reconnect using browser-stored keys.
 */
async function findUserByPrivateKey(privateKeyInput: string) {
  const privateKeyHex = normalizePrivateKey(privateKeyInput)
  const publicKey = derivePublicKey(privateKeyHex)

  if (!verifyNostrPubkey(publicKey)) {
    throw new Error('Derived invalid public key format')
  }

  const user = await prisma.user.findUnique({
    where: { pubkey: publicKey }
  })

  if (!user) {
    throw new Error('No account found for this private key')
  }

  const storedPrivkey = decryptPrivkey(user.privkey)
  if (!storedPrivkey || storedPrivkey !== privateKeyHex) {
    throw new Error('Private key mismatch for this account')
  }

  return user
}

/**
 * Normalize private key input (hex or nsec) to hex format
 */
function normalizePrivateKey(input: string): string {
  const trimmed = input.trim()
  
  // If it starts with nsec1, it's a bech32-encoded private key
  if (trimmed.startsWith('nsec1')) {
    try {
      // Cast to the expected type for snstr
      return decodePrivateKey(trimmed as `nsec1${string}`)
    } catch (error) {
      throw new Error('Invalid nsec format')
    }
  }
  
  // Otherwise, assume it's hex format
  if (!/^[a-f0-9]{64}$/i.test(trimmed)) {
    throw new Error('Invalid private key format. Must be 64-character hex string or nsec format.')
  }
  
  return trimmed.toLowerCase()
}

/**
 * Derive public key from private key
 */
function derivePublicKey(privateKeyHex: string): string {
  try {
    return getPublicKey(privateKeyHex)
  } catch (error) {
    throw new Error('Failed to derive public key from private key')
  }
}


// Build providers array based on configuration
const providers = []

// Add Email Provider if enabled
if (authConfig.providers.email.enabled) {
  providers.push(
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      maxAge: authConfig.providers.email.maxAge,
    })
  )
}

// Add Nostr Provider if enabled
if (authConfig.providers.nostr.enabled) {
  providers.push(
    CredentialsProvider({
      id: 'nostr',
      name: 'Nostr (NIP07)',
      credentials: {
        pubkey: { 
          label: 'Public Key', 
          type: 'text',
          placeholder: 'Your Nostr public key (hex format)'
        }
      },
      async authorize(credentials) {
        if (!credentials?.pubkey) {
          throw new Error('Missing public key')
        }

        try {
          // Verify the public key format
          if (!verifyNostrPubkey(credentials.pubkey)) {
            throw new Error('Invalid public key format')
          }

          // Check if user exists or create new user
          let user = await prisma.user.findUnique({
            where: { pubkey: credentials.pubkey }
          })

          if (!user && authConfig.providers.nostr.autoCreateUser) {
            // Create new user with Nostr pubkey (initial minimal data)
            user = await prisma.user.create({
              data: {
                pubkey: credentials.pubkey,
                username: `${authConfig.providers.nostr.usernamePrefix}${credentials.pubkey.substring(0, authConfig.providers.nostr.usernameLength)}`,
              }
            })
            console.log('Created new NIP07 user:', user.id)
          }

          if (!user) {
            throw new Error('User not found and auto-creation disabled')
          }

          // NOSTR-FIRST: Sync profile from Nostr (source of truth) for NIP07 users
          const syncedUser = await syncUserProfileFromNostr(user.id, credentials.pubkey)
          if (syncedUser) {
            user = syncedUser
          }

          return {
            id: user.id,
            email: user.email,
            name: user.username,
            image: user.avatar,
            pubkey: user.pubkey || undefined,
          }
        } catch (error) {
          console.error('Nostr authentication error:', error)
          return null
        }
      }
    })
  )
}

// Add GitHub Provider if enabled
if (authConfig.providers.github.enabled) {
  // Validate required GitHub environment variables
  if (!process.env.GITHUB_CLIENT_ID) {
    throw new Error('GitHub provider is enabled but GITHUB_CLIENT_ID environment variable is missing. Please set GITHUB_CLIENT_ID in your environment variables.')
  }
  
  if (!process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub provider is enabled but GITHUB_CLIENT_SECRET environment variable is missing. Please set GITHUB_CLIENT_SECRET in your environment variables.')
  }

  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      profile(profile) {
        // Check if user is in allowed list (if configured)
        const allowedUsers = authConfig.providers.github.allowedUsers as string[]
        if (allowedUsers.length > 0 && !allowedUsers.includes(profile.login)) {
          throw new Error(`Access denied for GitHub user: ${profile.login}`)
        }

        // Map GitHub profile to our database schema (basic fields only)
        return {
          id: profile.id.toString(),
          email: profile.email,
          name: profile.name || profile.login,
          image: profile.avatar_url,
        }
      }
    })
  )
}

// Add Anonymous Provider if enabled
if (authConfig.providers.anonymous.enabled) {
  providers.push(
    CredentialsProvider({
      id: 'anonymous',
      name: 'Anonymous',
      credentials: {
        privateKey: {
          label: 'Persisted Private Key',
          type: 'hidden'
        },
        generateKeys: {
          label: 'Generate Keys',
          type: 'hidden',
          value: 'true'
        }
      },
      async authorize(credentials) {
        try {
          // Allow returning anonymous users to authenticate with their persisted private key
          if (credentials?.privateKey) {
            const existingUser = await findUserByPrivateKey(credentials.privateKey)
            console.log('Reusing persisted anonymous user:', existingUser.id)

            // NOSTR-FIRST: Keep resumed anonymous users in sync with their live Nostr profile
            let syncedUser = existingUser
            if (existingUser.pubkey) {
              const refreshed = await syncUserProfileFromNostr(existingUser.id, existingUser.pubkey)
              if (refreshed) {
                syncedUser = refreshed
                console.log('Synced anonymous user profile from Nostr on resume')
              }
            }

            return {
              id: syncedUser.id,
              email: syncedUser.email,
              username: syncedUser.username || undefined,
              avatar: syncedUser.avatar || undefined,
              pubkey: syncedUser.pubkey || undefined,
            }
          }

          // Generate new Nostr keypair using snstr
          const keys = await generateKeypair()
          
          if (!keys || !keys.publicKey || !keys.privateKey) {
            throw new Error('Failed to generate Nostr keys')
          }

          // Verify the generated public key format
          if (!verifyNostrPubkey(keys.publicKey)) {
            throw new Error('Generated invalid public key format')
          }

          // Generate anonymous user data as fallback
          const userData = generateAnonymousUserData(keys.publicKey)

          // Create new anonymous user if auto-creation is enabled
          if (authConfig.providers.anonymous.autoCreateUser) {
            let user = await prisma.user.create({
              data: {
                pubkey: keys.publicKey,
                privkey: encryptPrivkey(keys.privateKey), // Store for anonymous accounts
                username: userData.username,
                avatar: userData.avatar
              }
            })
            console.log('Created new anonymous user:', user.id)

            // NOSTR-FIRST: Try to sync profile from Nostr (source of truth) for anonymous users
            // This allows users with existing Nostr profiles to have them recognized
            const syncedUser = await syncUserProfileFromNostr(user.id, keys.publicKey)
            if (syncedUser) {
              user = syncedUser
              console.log('Synced anonymous user profile from Nostr')
            } else {
              console.log('No Nostr profile found for anonymous user, using generated data')
            }

            return {
              id: user.id,
              email: user.email,
              username: user.username || undefined,
              avatar: user.avatar || undefined,
              pubkey: user.pubkey || undefined,
            }
          }

          throw new Error('Anonymous user creation disabled')
        } catch (error) {
          console.error('Anonymous authentication error:', error)
          return null
        }
      }
    })
  )
}

// Add Recovery Provider if enabled
if (authConfig.providers.recovery.enabled) {
  providers.push(
    CredentialsProvider({
      id: 'recovery',
      name: 'Account Recovery',
      credentials: {
        privateKey: {
          label: 'Private Key',
          type: 'password',
          placeholder: 'Enter your private key (hex or nsec format)'
        }
      },
      async authorize(credentials) {
        if (!credentials?.privateKey) {
          throw new Error('Missing private key')
        }

        try {
          /**
           * EPHEMERAL ACCOUNT RECOVERY:
           * ==========================
           * 
           * This provider allows users to recover their ephemeral accounts
           * (email, GitHub, anonymous) by providing their private key.
           * 
           * The process:
           * 1. Normalize the private key (hex or nsec format)
           * 2. Derive the public key from the private key
           * 3. Find the user by public key in the database
           * 4. Authenticate them if the account exists
           * 
           * This ensures users can recover their accounts even if they
           * lose access to their original authentication method.
           */
          
          // Normalize private key input (supports both hex and nsec formats)
          const privateKeyHex = normalizePrivateKey(credentials.privateKey)
          
          // Derive public key from private key
          const publicKey = derivePublicKey(privateKeyHex)
          
          // Verify the derived public key format
          if (!verifyNostrPubkey(publicKey)) {
            throw new Error('Derived invalid public key format')
          }

          // Find user by public key (they should have an ephemeral account)
          const user = await prisma.user.findUnique({
            where: { pubkey: publicKey }
          })

          if (!user) {
            throw new Error('No account found for this private key')
          }

          // Verify this is an ephemeral account (should have privkey stored)
          if (!user.privkey) {
            throw new Error('This private key belongs to a NIP07 account. Please use the Nostr provider instead.')
          }

          // Additional security: verify the provided private key matches the stored one
          const storedPrivkey = decryptPrivkey(user.privkey)
          if (storedPrivkey !== privateKeyHex) {
            throw new Error('Private key does not match stored key for this account')
          }

          console.log('Recovery successful for user:', user.email || user.username || user.pubkey?.substring(0, 8))

          return {
            id: user.id,
            email: user.email,
            name: user.username,
            image: user.avatar,
            username: user.username || undefined,
            pubkey: user.pubkey || undefined,
          }
        } catch (error) {
          console.error('Account recovery error:', error)
          return null
        }
      }
    })
  )
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  
  providers,

  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url'
        : 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Host-next-auth.csrf-token'
        : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },

  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      const refreshFromDatabase = async () => {
        if (!token.userId) {
          return
        }
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: {
              username: true,
              avatar: true,
              email: true,
              nip05: true,
              lud16: true,
              banner: true,
            },
          })
          if (dbUser) {
            token.username = dbUser.username ?? undefined
            token.avatar = dbUser.avatar ?? undefined
            token.email = dbUser.email ?? undefined
            token.nip05 = dbUser.nip05 ?? undefined
            token.lud16 = dbUser.lud16 ?? undefined
            token.banner = dbUser.banner ?? undefined
          }
        } catch (error) {
          console.error('Failed to refresh user data from database in JWT callback:', error)
          // Silently return without modifying token to allow JWT callback to continue
        }
      }

      if (trigger === 'update') {
        await refreshFromDatabase()
        return token
      }

      // Add user info to JWT token
      if (user) {
        token.pubkey = user.pubkey || undefined
        token.userId = user.id
        token.username = user.username || user.name || undefined
        token.avatar = user.avatar || user.image || undefined
        token.provider = account?.provider
        token.email = user.email || undefined
        
        /**
         * EPHEMERAL KEYPAIR HANDLING IN JWT:
         * =================================
         * 
         * We include the private key in the JWT token ONLY for users who authenticate
         * via providers that use ephemeral keypairs (anonymous, email, github).
         * 
         * NIP07 users manage their own keys and should never have privkey in our system.
         * Future NIP46 users will also manage keys remotely.
         * 
         * This allows ephemeral account users to sign Nostr events client-side
         * while maintaining security for user-controlled key authentication.
         */
        if (account?.provider && !['nostr'].includes(account.provider)) {
          // Fetch the user's privkey and additional profile data from database for ephemeral accounts
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { 
              privkey: true,
              username: true,
              avatar: true,
              nip05: true,
              lud16: true,
              banner: true
            }
          })
          token.privkey = dbUser?.privkey ? decryptPrivkey(dbUser.privkey) || undefined : undefined
          // Update token with latest database values (null/undefined overwrites token)
          token.username = dbUser?.username ?? undefined
          token.avatar = dbUser?.avatar ?? undefined
          token.nip05 = dbUser?.nip05 ?? undefined
          token.lud16 = dbUser?.lud16 ?? undefined
          token.banner = dbUser?.banner ?? undefined
          
          // Debug info for ephemeral keypair handling (development only)
          if (process.env.NODE_ENV === 'development') {
            console.log('JWT Callback - Ephemeral keypair handling for provider:', account.provider)
          }
        }
      } else {
        await refreshFromDatabase()
      }
      return token
    },
    
    async session({ session, token }) {
      // Add user info to session and map database fields to expected session fields
      if (token) {
        session.user.id = token.userId as string
        session.user.pubkey = token.pubkey as string
        session.user.username = token.username as string
        session.user.email = token.email as string
        // Map avatar to image for NextAuth compatibility
        session.user.image = token.avatar as string
        // Map username to name for NextAuth compatibility
        session.user.name = token.username as string
        // Add provider to session for client-side signing detection
        session.provider = token.provider as string
        // Add additional Nostr profile fields to session
        Object.assign(session.user, {
          nip05: token.nip05,
          lud16: token.lud16,
          banner: token.banner
        })
        
        // For Nostr-first accounts, fetch and include complete Nostr profile
        if (session.user.pubkey) {
          try {
            const completeNostrProfile = await fetchNostrProfile(session.user.pubkey)
            if (completeNostrProfile) {
              session.user.nostrProfile = completeNostrProfile
            }
          } catch (error) {
            console.error('Failed to fetch complete Nostr profile for session:', error)
          }
        }
        
        /**
         * EPHEMERAL KEYPAIR HANDLING IN SESSION:
         * =====================================
         * 
         * We expose the private key in the user session for users who have ephemeral keypairs.
         * This includes anonymous, email, and GitHub users.
         * 
         * For existing users who already have sessions, we determine if they need privkey
         * by checking if they have one stored in the database. NIP07 users never have
         * privkey stored since they manage their own keys.
         * 
         * This enables client-side Nostr event signing for ephemeral account users while
         * keeping private keys secure for NIP07/NIP46 users who manage their own keys.
         */
        
        // Check if user has ephemeral keys by looking for stored privkey
        // NIP07 users won't have privkey stored in database
        if (session.user.pubkey) {
          // If privkey is already in token, use it (for new logins)
          if (token.privkey) {
            session.user.privkey = token.privkey as string
          } else {
            // For existing sessions, fetch privkey from database if it exists
            try {
              const dbUser = await prisma.user.findUnique({
                where: { id: token.userId as string },
                select: { privkey: true }
              })
              if (dbUser?.privkey) {
                const decrypted = decryptPrivkey(dbUser.privkey)
                if (decrypted) {
                  session.user.privkey = decrypted
                }
              }
              // If no privkey in database, this is likely a NIP07 user (expected)
            } catch (error) {
              console.error('Failed to fetch privkey for session:', error)
            }
          }
        }
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      // Use configured redirect URL after successful auth
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return `${baseUrl}${authConfig.security.redirectAfterSignin}`
    }
  },

  pages: {
    signIn: authConfig.pages.signin,
    verifyRequest: authConfig.pages.verifyRequest,
    error: authConfig.pages.error,
  },

  session: {
    strategy: authConfig.session.strategy as 'jwt' | 'database',
    maxAge: authConfig.session.maxAge,
    updateAge: authConfig.session.updateAge,
  },

  events: {
    async createUser({ user }) {
      console.log('New user created:', user.email || user.pubkey || user.username)
      
      /**
       * OAUTH-FIRST: EPHEMERAL KEYPAIR GENERATION ON USER CREATION
       * ==========================================================
       * 
       * When a new OAuth-first user is created via email or GitHub,
       * they don't have Nostr keys yet. Generate ephemeral background 
       * keys for transparent Nostr protocol participation.
       * 
       * This does NOT apply to Nostr-first providers:
       * - NIP07 users: Provide their own pubkey via browser extension
       * - Anonymous users: Get keys generated in authorize function
       * - Recovery users: Already have existing keys
       * 
       * OAuth-first users get background Nostr capabilities while
       * maintaining their OAuth identity as the primary source of truth.
       */
      if (!user.pubkey) {
        try {
          const keys = await generateKeypair()
          
          if (keys && keys.publicKey && keys.privateKey) {
            // Update user with generated Nostr keys
            await prisma.user.update({
              where: { id: user.id },
              data: {
                pubkey: keys.publicKey,
                privkey: encryptPrivkey(keys.privateKey),
              }
            })
            console.log('Generated ephemeral Nostr keypair for OAuth-first user:', user.email || user.username)
          }
        } catch (error) {
          console.error('Failed to generate ephemeral Nostr keypair:', error)
        }
      }
    },
    async signIn({ user, account }) {
      console.log('User signed in:', user.email || user.pubkey || user.username, 'via', account?.provider)
      
      /**
       * ACCOUNT LINKING: SET PRIMARY PROVIDER ON FIRST SIGN-IN
       * ======================================================
       * 
       * When a user signs in for the first time with a provider,
       * set it as their primary provider if they don't have one yet.
       * This determines which profile source is authoritative.
       */
      if (account?.provider && user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { primaryProvider: true, profileSource: true }
        })
        
        if (dbUser && !dbUser.primaryProvider) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              primaryProvider: account.provider,
              profileSource: getProfileSourceForProvider(account.provider)
            }
          })
          console.log(`Set primary provider to ${account.provider} for user ${user.id}`)
        }
      }
      
      /**
       * OAUTH-FIRST: EPHEMERAL KEYPAIR GENERATION ON SIGN IN
       * ====================================================
       * 
       * For existing OAuth-first users (email/GitHub) who signed up before 
       * the ephemeral keypair system, generate background Nostr keys on sign-in.
       * 
       * This ensures backward compatibility - all OAuth-first users get 
       * background Nostr capabilities without knowing about it.
       * 
       * Exclusions (these providers handle keys differently):
       * - 'nostr': Nostr-first users provide their own keys via NIP07
       * - 'anonymous': Nostr-first users get keys in the authorize function  
       * - 'recovery': Users recovering with existing keys
       */
      if (!user.pubkey && account?.provider && !isNostrFirstProvider(account.provider)) {
        try {
          const keys = await generateKeypair()
          
          if (keys && keys.publicKey && keys.privateKey) {
            // Update user with generated ephemeral Nostr keys
            await prisma.user.update({
              where: { id: user.id },
              data: {
                pubkey: keys.publicKey,
                privkey: encryptPrivkey(keys.privateKey),
              }
            })
            console.log('Generated ephemeral Nostr keypair for OAuth-first user:', user.email || user.username)
          }
        } catch (error) {
          console.error('Failed to generate ephemeral Nostr keypair for OAuth-first user:', error)
        }
      }
      
      /**
       * PROFILE SYNC BASED ON PROFILE SOURCE
       * ====================================
       * 
       * Sync profile from Nostr ONLY if the user's profileSource is set to 'nostr'
       * or if they don't have a profileSource but their primary provider is Nostr-first.
       * 
       * This respects the user's account linking preferences and ensures
       * the correct profile source is used based on their settings.
       */
      if (user.pubkey && user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { profileSource: true, primaryProvider: true }
        })
        
        if (dbUser && shouldSyncFromNostr(dbUser)) {
          try {
            console.log(`Syncing profile from Nostr (profileSource: ${dbUser.profileSource}, primaryProvider: ${dbUser.primaryProvider})`)
            await syncUserProfileFromNostr(user.id, user.pubkey)
          } catch (error) {
            console.error('Failed to sync Nostr profile:', error)
            // Don't fail the sign-in if profile sync fails
          }
        } else {
          console.log(`Skipping Nostr profile sync (profileSource: ${dbUser?.profileSource}, primaryProvider: ${dbUser?.primaryProvider})`)
        }
      }
    }
  },

  debug: process.env.NODE_ENV === 'development',
}

// Export helper functions and configuration
export { verifyNostrPubkey, authConfig, syncUserProfileFromNostr, fetchNostrProfile } 
