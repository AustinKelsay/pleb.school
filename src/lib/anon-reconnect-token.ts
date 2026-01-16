/**
 * Anonymous Reconnect Token Utilities
 *
 * Secure reconnect token system that replaces plaintext private key storage
 * in localStorage for anonymous accounts.
 *
 * SECURITY PROPERTIES:
 * - Token is random, cannot derive private key or sign Nostr events
 * - Database stores only SHA-256 hash, not plaintext token
 * - Token rotates on every successful authentication (limits stolen token window)
 * - Constant-time comparison prevents timing attacks
 *
 * See: llm/context/profile-system-architecture.md
 */

import crypto from 'crypto'

const TOKEN_BYTES = 32 // 256-bit random token

/**
 * Generate a new reconnect token and its hash
 *
 * @returns { token, tokenHash } - Token for client storage, hash for database
 */
export function generateReconnectToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  const tokenHash = hashToken(token)
  return { token, tokenHash }
}

/**
 * Hash a reconnect token using SHA-256
 *
 * @param token - Plaintext token
 * @returns SHA-256 hash (hex encoded)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Verify a reconnect token against a stored hash using constant-time comparison
 *
 * @param token - Plaintext token from client
 * @param storedHash - SHA-256 hash from database
 * @returns true if token matches hash
 */
export function verifyToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash) {
    return false
  }

  try {
    const tokenHash = hashToken(token)
    const tokenHashBuffer = Buffer.from(tokenHash, 'utf8')
    const storedHashBuffer = Buffer.from(storedHash, 'utf8')

    // Constant-time comparison to prevent timing attacks
    if (tokenHashBuffer.length !== storedHashBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(tokenHashBuffer, storedHashBuffer)
  } catch {
    return false
  }
}
