/**
 * NextAuth Type Extensions
 * 
 * This file extends the default NextAuth types to include
 * custom properties like Nostr pubkeys and private keys for ephemeral accounts
 */

import { DefaultSession, DefaultUser } from 'next-auth'
import { JWT, DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      pubkey?: string
      username?: string
      privkey?: string  // Private key for ephemeral accounts (anonymous, email, github)
      reconnectToken?: string  // Secure reconnect token for anonymous session persistence
      nostrProfile?: Record<string, unknown>  // Complete Nostr profile from NIP-01 kind 0 event
      nip05?: string
      lud16?: string
      banner?: string
    } & DefaultSession['user']
    provider?: string  // Track which provider was used for current session
  }

  interface User {
    id: string
    email?: string | null
    username?: string
    image?: string | null
    avatar?: string
    pubkey?: string
    reconnectToken?: string  // Returned from anonymous provider for client storage
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    userId?: string
    pubkey?: string
    username?: string
    avatar?: string
    privkey?: string  // Private key for ephemeral accounts
    reconnectToken?: string  // Secure reconnect token for anonymous accounts
    provider?: string // Track which provider was used for authentication
    email?: string
    nip05?: string
    lud16?: string
    banner?: string
  }
} 
