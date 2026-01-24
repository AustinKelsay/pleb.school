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
import { generateKeypair, decodePrivateKey, getPublicKey, verifySignature, getEventHash } from 'snstr'
import authConfig from '../../config/auth.json'
import { 
  isNostrFirstProvider, 
  isOAuthFirstProvider, 
  getProfileSourceForProvider,
  shouldSyncFromNostr 
} from './account-linking'
import { fetchNostrProfile, syncUserProfileFromNostr } from './nostr-profile'
import { encryptPrivkey, decryptPrivkey } from './privkey-crypto'
import { checkRateLimit, RATE_LIMITS, getClientIp } from './rate-limit'
import { generateReconnectToken, hashToken } from './anon-reconnect-token'
import { normalizeHexPubkey } from './nostr-keys'
import { createTransport } from 'nodemailer'
import crypto from 'crypto'

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
  if (!storedPrivkey) {
    throw new Error('Private key mismatch for this account')
  }

  // Security: Use constant-time comparison to prevent timing attacks
  // Normalize stored key to lowercase to match normalized input (handles legacy mixed-case storage)
  const storedBuffer = Buffer.from(storedPrivkey.toLowerCase(), 'utf8')
  const inputBuffer = Buffer.from(privateKeyHex, 'utf8')
  if (storedBuffer.length !== inputBuffer.length ||
      !crypto.timingSafeEqual(storedBuffer, inputBuffer)) {
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
      // Cast to the expected type for snstr, normalize to lowercase for consistent comparison
      return decodePrivateKey(trimmed as `nsec1${string}`).toLowerCase()
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
      /**
       * Custom sendVerificationRequest with rate limiting
       * Prevents email flooding by limiting magic link requests per email address
       */
      async sendVerificationRequest({ identifier: email, url, provider }) {
        // Rate limit by email address
        const rateLimit = await checkRateLimit(
          `auth-magic-link:${email.toLowerCase()}`,
          RATE_LIMITS.AUTH_MAGIC_LINK.limit,
          RATE_LIMITS.AUTH_MAGIC_LINK.windowSeconds
        )

        if (!rateLimit.success) {
          // Redact email for logging (keep first char + domain for debugging)
          const [local, domain] = email.split('@')
          const redacted = `${local[0]}***@${domain}`
          console.warn(`Rate limit exceeded for magic link: ${redacted}`)
          throw new Error('Too many sign-in attempts. Please try again later.')
        }

        // Send the email using nodemailer
        const transport = createTransport(provider.server)
        const result = await transport.sendMail({
          to: email,
          from: provider.from,
          subject: 'Sign in to pleb.school',
          text: `Sign in to pleb.school\n\nClick this link to sign in:\n${url}\n\nIf you didn't request this, you can ignore this email.\n`,
          html: `
            <div style="max-width: 480px; margin: 0 auto; font-family: sans-serif;">
              <h2 style="color: #1a1a1a;">Sign in to pleb.school</h2>
              <p>Click the button below to sign in:</p>
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
                Sign in
              </a>
              <p style="color: #666; font-size: 14px;">Or copy this link: ${url}</p>
              <p style="color: #999; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
            </div>
          `,
        })

        const failed = result.rejected.concat(result.pending).filter(Boolean)
        if (failed.length) {
          throw new Error(`Email could not be sent to ${failed.join(', ')}`)
        }
      },
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
        },
        authEvent: {
          label: 'NIP-98 Auth Event',
          type: 'text',
          placeholder: 'Signed NIP-98 authentication event'
        }
      },
      async authorize(credentials) {
        if (!credentials?.pubkey) {
          throw new Error('Missing public key')
        }

        try {
          // Verify and normalize public key (lowercase hex per NIP-01)
          const pubkey = normalizeHexPubkey(credentials.pubkey)
          if (!pubkey) {
            throw new Error('Invalid public key format')
          }

          // Rate limit BEFORE expensive crypto operations
          const rateLimit = await checkRateLimit(
            `auth-nostr:${pubkey}`,
            RATE_LIMITS.AUTH_NOSTR.limit,
            RATE_LIMITS.AUTH_NOSTR.windowSeconds
          )

          if (!rateLimit.success) {
            console.warn(`Rate limit exceeded for Nostr auth: ${pubkey.substring(0, 8)}...`)
            throw new Error('Too many authentication attempts. Please try again later.')
          }

          // ============================================================
          // NIP-98 Authentication - Cryptographic proof of pubkey ownership
          // See: https://nips.nostr.com/98
          // ============================================================
          if (!credentials.authEvent) {
            console.warn('NIP-98 auth event missing for pubkey:', pubkey.substring(0, 8))
            throw new Error('Authentication failed')
          }

          let authEvent: {
            id: string
            pubkey: string
            created_at: number
            kind: number
            tags: string[][]
            content: string
            sig: string
          }

          try {
            authEvent = JSON.parse(credentials.authEvent)
          } catch {
            console.warn('Failed to parse NIP-98 auth event')
            throw new Error('Authentication failed')
          }

          // 1. Verify event kind is 27235 (NIP-98)
          if (authEvent.kind !== 27235) {
            console.warn('Invalid NIP-98 event kind:', authEvent.kind)
            throw new Error('Authentication failed')
          }

          // 2. Verify event ID is correctly computed from fields (prevents tag substitution attacks)
          // Without this, an attacker could sign arbitrary data and pair it with fake URL/method tags
          const computedId = await getEventHash({
            pubkey: authEvent.pubkey,
            created_at: authEvent.created_at,
            kind: authEvent.kind,
            tags: authEvent.tags,
            content: authEvent.content
          })
          if (computedId !== authEvent.id) {
            console.warn('NIP-98 event ID mismatch (computed vs provided)')
            throw new Error('Authentication failed')
          }

          // 3. Verify signature proves pubkey ownership
          if (!await verifySignature(authEvent.id, authEvent.sig, authEvent.pubkey)) {
            console.warn('Invalid NIP-98 signature for pubkey:', pubkey.substring(0, 8))
            throw new Error('Authentication failed')
          }

          // 4. Verify signed pubkey matches claimed pubkey (normalize both for comparison)
          if (authEvent.pubkey.toLowerCase() !== pubkey) {
            console.warn('NIP-98 pubkey mismatch:', authEvent.pubkey.substring(0, 8), 'vs', pubkey.substring(0, 8))
            throw new Error('Authentication failed')
          }

          // 5. Verify timestamp is fresh (asymmetric window: 30s future / 60s past)
          // - Allow 30s future to handle client clock skew
          // - Allow 60s past (NIP-98 suggests "reasonable window", we chose 60s)
          const now = Math.floor(Date.now() / 1000)
          const eventAge = now - authEvent.created_at
          if (eventAge < -30 || eventAge > 60) {
            console.warn('NIP-98 event expired or future:', eventAge, 'seconds old')
            throw new Error('Authentication failed')
          }

          // 6. Verify URL tag matches expected callback
          const urlTag = authEvent.tags.find((t: string[]) => t[0] === 'u')
          const expectedUrl = `${process.env.NEXTAUTH_URL}/api/auth/callback/nostr`
          if (!urlTag || urlTag[1] !== expectedUrl) {
            console.warn('NIP-98 URL mismatch. Expected:', expectedUrl, 'Got:', urlTag?.[1])
            throw new Error('Authentication failed')
          }

          // 7. Verify method tag is POST
          const methodTag = authEvent.tags.find((t: string[]) => t[0] === 'method')
          if (!methodTag || methodTag[1] !== 'POST') {
            console.warn('NIP-98 method mismatch. Expected: POST, Got:', methodTag?.[1])
            throw new Error('Authentication failed')
          }

          // NIP-98 validation passed - pubkey ownership verified
          console.log('NIP-98 auth verified for pubkey:', pubkey.substring(0, 8))

          // Check if user exists or create new user
          let user = await prisma.user.findUnique({
            where: { pubkey }
          })

          if (!user && authConfig.providers.nostr.autoCreateUser) {
            // Create new user with Nostr pubkey (initial minimal data)
            user = await prisma.user.create({
              data: {
                pubkey,
                username: `${authConfig.providers.nostr.usernamePrefix}${pubkey.substring(0, authConfig.providers.nostr.usernameLength)}`,
              }
            })
            console.log('Created new NIP07 user:', user.id)
          }

          if (!user) {
            throw new Error('User not found and auto-creation disabled')
          }

          // NOSTR-FIRST: Sync profile from Nostr (source of truth) for NIP07 users
          const syncedUser = await syncUserProfileFromNostr(user.id, pubkey)
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
        reconnectToken: {
          label: 'Reconnect Token',
          type: 'hidden'
        },
        privateKey: {
          label: 'Legacy Private Key (migration only)',
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
          // ============================================================
          // Secure token-based reconnection (no private keys in localStorage)
          // See: llm/context/authentication-system.md
          //
          // Priority order for reconnect token:
          // 1. httpOnly cookie 'anon-reconnect-token' (secure path, XSS-resistant)
          // 2. credentials.reconnectToken (legacy localStorage fallback, being phased out)
          // ============================================================
          const COOKIE_NAME = 'anon-reconnect-token'
          let cookieToken: string | undefined
          try {
            // Access httpOnly cookie via next/headers (App Router context)
            const { cookies } = await import('next/headers')
            const cookieStore = await cookies()
            cookieToken = cookieStore.get(COOKIE_NAME)?.value
          } catch {
            // cookies() may not be available in all contexts
          }
          const reconnectToken = cookieToken || credentials?.reconnectToken

          if (reconnectToken) {
            // Rate limit by token hash
            const tokenHash = crypto.createHash('sha256')
              .update(reconnectToken).digest('hex').substring(0, 16)
            const tokenRateLimit = await checkRateLimit(
              `auth-anon-token:${tokenHash}`,
              RATE_LIMITS.AUTH_NOSTR.limit,
              RATE_LIMITS.AUTH_NOSTR.windowSeconds
            )

            if (!tokenRateLimit.success) {
              throw new Error('Too many authentication attempts. Please try again later.')
            }

            // Direct O(1) lookup by token hash (indexed unique field)
            const reconnectTokenHash = hashToken(reconnectToken)
            const matchedUser = await prisma.user.findUnique({
              where: { anonReconnectTokenHash: reconnectTokenHash },
              select: {
                id: true,
                email: true,
                username: true,
                avatar: true,
                pubkey: true
              }
            })

            if (!matchedUser) {
              console.warn('Anonymous token reconnection failed: no matching user')
              throw new Error('Invalid reconnect token')
            }

            console.log('Token-based anonymous reconnection:', matchedUser.id)

            // Rotate token on every successful auth (limits stolen token window)
            // Note: If DB update succeeds but response is lost, client has stale token.
            // This is an accepted edge case for ephemeral anonymous accounts - user
            // can create a new anonymous account if this rare scenario occurs.
            const { token: newToken, tokenHash: newTokenHash } = generateReconnectToken()
            await prisma.user.update({
              where: { id: matchedUser.id },
              data: { anonReconnectTokenHash: newTokenHash }
            })

            // NOSTR-FIRST: Keep resumed anonymous users in sync with their live Nostr profile
            let syncedUser = matchedUser
            if (matchedUser.pubkey) {
              const refreshed = await syncUserProfileFromNostr(matchedUser.id, matchedUser.pubkey)
              if (refreshed) {
                syncedUser = refreshed
                console.log('Synced anonymous user profile from Nostr on token resume')
              }
            }

            return {
              id: syncedUser.id,
              email: syncedUser.email,
              username: syncedUser.username || undefined,
              avatar: syncedUser.avatar || undefined,
              pubkey: syncedUser.pubkey || undefined,
              reconnectToken: newToken, // Return new rotated token
            }
          }

          // ============================================================
          // Legacy privkey migration path (auto-migrates to token format)
          // ============================================================
          if (credentials?.privateKey) {
            // Rate limit returning users by a hash of their private key
            const keyHash = crypto.createHash('sha256')
              .update(credentials.privateKey).digest('hex').substring(0, 16)
            const returnRateLimit = await checkRateLimit(
              `auth-anon-return:${keyHash}`,
              RATE_LIMITS.AUTH_NOSTR.limit,
              RATE_LIMITS.AUTH_NOSTR.windowSeconds
            )

            if (!returnRateLimit.success) {
              throw new Error('Too many authentication attempts. Please try again later.')
            }

            const existingUser = await findUserByPrivateKey(credentials.privateKey)
            console.log('Legacy privkey migration for user:', existingUser.id)

            // Generate new reconnect token and store hash
            const { token: newToken, tokenHash: newTokenHash } = generateReconnectToken()
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { anonReconnectTokenHash: newTokenHash }
            })

            // NOSTR-FIRST: Keep resumed anonymous users in sync with their live Nostr profile
            let syncedUser = existingUser
            if (existingUser.pubkey) {
              const refreshed = await syncUserProfileFromNostr(existingUser.id, existingUser.pubkey)
              if (refreshed) {
                syncedUser = refreshed
                console.log('Synced anonymous user profile from Nostr on legacy migration')
              }
            }

            return {
              id: syncedUser.id,
              email: syncedUser.email,
              username: syncedUser.username || undefined,
              avatar: syncedUser.avatar || undefined,
              pubkey: syncedUser.pubkey || undefined,
              reconnectToken: newToken, // Return token for client to store
            }
          }

          // ============================================================
          // New anonymous account creation with token
          // ============================================================

          // Dual-bucket rate limiting: per-IP (primary) + global (backstop)
          // Per-IP prevents single-source abuse; global prevents distributed attacks
          const clientIp = await getClientIp()

          // Check per-IP rate limit first (stricter, 5/hour per IP)
          const perIpRateLimit = await checkRateLimit(
            `auth-anon-new:ip:${clientIp}`,
            RATE_LIMITS.AUTH_ANONYMOUS_PER_IP.limit,
            RATE_LIMITS.AUTH_ANONYMOUS_PER_IP.windowSeconds
          )

          if (!perIpRateLimit.success) {
            // Sanitize IP for logging to prevent log injection via control characters
            const safeIp = clientIp.replace(/[\x00-\x1f\x7f]/g, '')
            console.warn(`Per-IP rate limit exceeded for anonymous accounts: ${safeIp}`)
            throw new Error('Too many new accounts created from your location. Please try again later.')
          }

          // Check global rate limit (looser, 50/hour total as backstop)
          const globalRateLimit = await checkRateLimit(
            'auth-anon-new:global',
            RATE_LIMITS.AUTH_ANONYMOUS_GLOBAL.limit,
            RATE_LIMITS.AUTH_ANONYMOUS_GLOBAL.windowSeconds
          )

          if (!globalRateLimit.success) {
            console.warn('Global rate limit exceeded for new anonymous accounts')
            throw new Error('Too many new accounts created. Please try again later.')
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

          // Generate reconnect token for session persistence
          const { token: newToken, tokenHash: newTokenHash } = generateReconnectToken()

          // Create new anonymous user if auto-creation is enabled
          if (authConfig.providers.anonymous.autoCreateUser) {
            let user = await prisma.user.create({
              data: {
                pubkey: keys.publicKey,
                privkey: encryptPrivkey(keys.privateKey), // Store encrypted for Nostr signing
                anonReconnectTokenHash: newTokenHash, // Store token hash for reconnection
                username: userData.username,
                avatar: userData.avatar
              }
            })
            console.log('Created new anonymous user with token:', user.id)

            // NOSTR-FIRST: Try to sync profile from Nostr (source of truth) for anonymous users
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
              reconnectToken: newToken, // Return token for client to store
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
              privkey: true,
            },
          })
          if (dbUser) {
            token.username = dbUser.username ?? undefined
            token.avatar = dbUser.avatar ?? undefined
            token.email = dbUser.email ?? undefined
            token.nip05 = dbUser.nip05 ?? undefined
            token.lud16 = dbUser.lud16 ?? undefined
            token.banner = dbUser.banner ?? undefined
            // Update hasEphemeralKeys to reflect current database state (e.g., after account linking)
            token.hasEphemeralKeys = !!dbUser.privkey
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
        // Pass reconnect token through JWT for client storage
        token.reconnectToken = user.reconnectToken || undefined
        
        /**
         * EPHEMERAL KEYPAIR DETECTION IN JWT:
         * ===================================
         *
         * We set a hasEphemeralKeys flag for users who have platform-managed keypairs
         * (anonymous, email, github). The actual private key is NEVER included in the
         * JWT/session for security - it's only fetched on-demand via the recovery-key API.
         *
         * NIP07 users manage their own keys and will have hasEphemeralKeys = false.
         * Future NIP46 users will also manage keys remotely.
         */
        if (account?.provider && !['nostr'].includes(account.provider)) {
          // Check if user has ephemeral keys and fetch additional profile data
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
          // Only indicate presence of ephemeral keys, never expose the key itself
          token.hasEphemeralKeys = !!dbUser?.privkey
          // Update token with latest database values (null/undefined overwrites token)
          token.username = dbUser?.username ?? undefined
          token.avatar = dbUser?.avatar ?? undefined
          token.nip05 = dbUser?.nip05 ?? undefined
          token.lud16 = dbUser?.lud16 ?? undefined
          token.banner = dbUser?.banner ?? undefined

          // Debug info for ephemeral keypair handling (development only)
          if (process.env.NODE_ENV === 'development') {
            console.log('JWT Callback - Ephemeral keypair detection for provider:', account.provider, 'hasEphemeralKeys:', !!dbUser?.privkey)
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
        // Pass reconnect token to client for secure localStorage persistence
        session.user.reconnectToken = token.reconnectToken as string | undefined
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
         * EPHEMERAL KEYPAIR DETECTION IN SESSION:
         * =======================================
         *
         * We expose a hasEphemeralKeys boolean to indicate if the user has platform-managed
         * ephemeral keypairs (anonymous, email, GitHub users).
         *
         * The actual private key is NEVER exposed in the session for security. When client-side
         * signing is needed, the key is fetched on-demand via the recovery-key API.
         *
         * NIP07 users will have hasEphemeralKeys = false since they manage their own keys.
         */

        // Determine if user has ephemeral keys (for account type detection)
        if (session.user.pubkey) {
          // If hasEphemeralKeys is already set in token (for new logins), use it
          if (typeof token.hasEphemeralKeys === 'boolean') {
            session.user.hasEphemeralKeys = token.hasEphemeralKeys
          } else {
            // For existing sessions, check database for stored privkey
            try {
              const dbUser = await prisma.user.findUnique({
                where: { id: token.userId as string },
                select: { privkey: true }
              })
              session.user.hasEphemeralKeys = !!dbUser?.privkey
              // If no privkey in database, this is a NIP07 user (hasEphemeralKeys = false)
            } catch (error) {
              console.error('Failed to check ephemeral keys for session:', error)
              session.user.hasEphemeralKeys = false
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
