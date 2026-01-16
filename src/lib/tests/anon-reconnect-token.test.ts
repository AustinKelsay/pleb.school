/**
 * Anonymous Reconnect Token Tests
 *
 * Tests for the secure token-based reconnection system that replaced
 * plaintext private key storage in localStorage.
 *
 * See: llm/context/profile-system-architecture.md
 */

import { describe, it, expect } from 'vitest'
import { generateReconnectToken, hashToken, verifyToken } from '../anon-reconnect-token'

describe('anon-reconnect-token', () => {
  describe('generateReconnectToken', () => {
    it('generates a token and hash pair', () => {
      const { token, tokenHash } = generateReconnectToken()

      expect(token).toBeDefined()
      expect(tokenHash).toBeDefined()
      expect(token).not.toBe(tokenHash)
    })

    it('generates unique tokens each time', () => {
      const result1 = generateReconnectToken()
      const result2 = generateReconnectToken()

      expect(result1.token).not.toBe(result2.token)
      expect(result1.tokenHash).not.toBe(result2.tokenHash)
    })

    it('generates 64-character hex tokens (256-bit)', () => {
      const { token } = generateReconnectToken()

      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })

    it('generates 64-character hex hashes (SHA-256)', () => {
      const { tokenHash } = generateReconnectToken()

      expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('hashToken', () => {
    it('produces consistent hash for same input', () => {
      const token = 'test-token-12345'
      const hash1 = hashToken(token)
      const hash2 = hashToken(token)

      expect(hash1).toBe(hash2)
    })

    it('produces different hashes for different inputs', () => {
      const hash1 = hashToken('token-a')
      const hash2 = hashToken('token-b')

      expect(hash1).not.toBe(hash2)
    })

    it('returns 64-character hex string (SHA-256)', () => {
      const hash = hashToken('any-token')

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('verifyToken', () => {
    it('returns true for matching token and hash', () => {
      const { token, tokenHash } = generateReconnectToken()

      expect(verifyToken(token, tokenHash)).toBe(true)
    })

    it('returns false for wrong token', () => {
      const { tokenHash } = generateReconnectToken()
      const wrongToken = 'wrong-token'

      expect(verifyToken(wrongToken, tokenHash)).toBe(false)
    })

    it('returns false for wrong hash', () => {
      const { token } = generateReconnectToken()
      const wrongHash = hashToken('different-token')

      expect(verifyToken(token, wrongHash)).toBe(false)
    })

    it('returns false for empty token', () => {
      const { tokenHash } = generateReconnectToken()

      expect(verifyToken('', tokenHash)).toBe(false)
    })

    it('returns false for empty hash', () => {
      const { token } = generateReconnectToken()

      expect(verifyToken(token, '')).toBe(false)
    })

    it('returns false for null/undefined inputs', () => {
      expect(verifyToken(null as unknown as string, 'hash')).toBe(false)
      expect(verifyToken('token', null as unknown as string)).toBe(false)
      expect(verifyToken(undefined as unknown as string, 'hash')).toBe(false)
    })
  })

  describe('O(1) lookup pattern', () => {
    /**
     * This test documents the O(1) lookup pattern used in auth.ts
     * Instead of loading all users and iterating, we:
     * 1. Compute hash of incoming token
     * 2. Query directly by hash (uses unique index)
     */
    it('demonstrates direct hash lookup pattern', () => {
      // Simulate what happens during authentication:
      // 1. Client sends reconnectToken
      const { token: clientToken, tokenHash: storedHash } = generateReconnectToken()

      // 2. Server computes hash of incoming token
      const computedHash = hashToken(clientToken)

      // 3. Direct lookup: computedHash === storedHash (O(1) with index)
      expect(computedHash).toBe(storedHash)

      // This pattern replaces the old O(n) approach:
      // - OLD: Load all users, iterate with verifyToken()
      // - NEW: findUnique({ where: { anonReconnectTokenHash: computedHash } })
    })

    it('wrong token produces different hash (no false positives)', () => {
      const { tokenHash: storedHash } = generateReconnectToken()
      const wrongToken = 'attacker-guessed-token'

      const attackerHash = hashToken(wrongToken)

      // Direct comparison would fail - no user found
      expect(attackerHash).not.toBe(storedHash)
    })
  })
})
