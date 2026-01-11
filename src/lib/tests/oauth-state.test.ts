/**
 * Tests for OAuth state security module
 *
 * These tests verify that the OAuth state signing and verification
 * properly prevents CSRF attacks on account linking.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mock environment before importing the module
const MOCK_SECRET = 'test-secret-for-oauth-state-testing-only'

beforeAll(() => {
  vi.stubEnv('NEXTAUTH_SECRET', MOCK_SECRET)
})

afterAll(() => {
  vi.unstubAllEnvs()
})

// Import after env is mocked
import { createSignedState, verifySignedState } from '../oauth-state'

describe('OAuth State Security', () => {
  describe('createSignedState', () => {
    it('creates a base64-encoded state', () => {
      const state = createSignedState({
        userId: 'test-user-123',
        action: 'link',
        provider: 'github'
      })

      expect(state).toBeTruthy()
      expect(typeof state).toBe('string')
      // Should be valid base64
      expect(() => Buffer.from(state, 'base64')).not.toThrow()
    })

    it('includes all required fields in the state', () => {
      const state = createSignedState({
        userId: 'test-user-123',
        action: 'link',
        provider: 'github'
      })

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))

      expect(decoded.userId).toBe('test-user-123')
      expect(decoded.action).toBe('link')
      expect(decoded.provider).toBe('github')
      expect(decoded.timestamp).toBeDefined()
      expect(typeof decoded.timestamp).toBe('number')
      expect(decoded.nonce).toBeDefined()
      expect(decoded.nonce.length).toBe(32) // 16 bytes as hex
      expect(decoded.sig).toBeDefined()
      expect(decoded.sig.length).toBe(64) // 32 bytes as hex
    })

    it('creates unique nonces for each state', () => {
      const state1 = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })
      const state2 = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      const decoded1 = JSON.parse(Buffer.from(state1, 'base64').toString('utf8'))
      const decoded2 = JSON.parse(Buffer.from(state2, 'base64').toString('utf8'))

      expect(decoded1.nonce).not.toBe(decoded2.nonce)
    })
  })

  describe('verifySignedState', () => {
    it('verifies a valid state', () => {
      const state = createSignedState({
        userId: 'test-user-123',
        action: 'link',
        provider: 'github'
      })

      const result = verifySignedState(state)

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.data.userId).toBe('test-user-123')
        expect(result.data.action).toBe('link')
        expect(result.data.provider).toBe('github')
      }
    })

    it('rejects empty state', () => {
      const result = verifySignedState('')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Missing state parameter')
      }
    })

    it('rejects null/undefined state', () => {
      const result = verifySignedState(null as any)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Missing state parameter')
      }
    })

    it('rejects invalid base64', () => {
      const result = verifySignedState('not-valid-base64!!!')
      expect(result.valid).toBe(false)
    })

    it('rejects state that is too large', () => {
      const largeState = 'A'.repeat(5000)
      const result = verifySignedState(largeState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('State parameter too large')
      }
    })

    it('rejects forged state with tampered userId', () => {
      // Create a valid state
      const state = createSignedState({
        userId: 'original-user',
        action: 'link',
        provider: 'github'
      })

      // Decode, tamper with userId, re-encode (without updating signature)
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      decoded.userId = 'victim-user'
      const tamperedState = Buffer.from(JSON.stringify(decoded)).toString('base64')

      const result = verifySignedState(tamperedState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state signature')
      }
    })

    it('rejects forged state with tampered timestamp', () => {
      const state = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      decoded.timestamp = Date.now() + 1000000 // Future timestamp
      const tamperedState = Buffer.from(JSON.stringify(decoded)).toString('base64')

      const result = verifySignedState(tamperedState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state signature')
      }
    })

    it('rejects crafted state without valid signature', () => {
      // Attacker crafts a state with victim's userId but invalid signature
      const craftedState = Buffer.from(JSON.stringify({
        userId: 'victim-user-id',
        action: 'link',
        provider: 'github',
        timestamp: Date.now(),
        nonce: '00'.repeat(16), // 32 hex chars
        sig: '00'.repeat(32)    // Invalid signature
      })).toString('base64')

      const result = verifySignedState(craftedState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state signature')
      }
    })

    it('rejects expired state (older than 10 minutes)', async () => {
      // Create state with mocked timestamp in the past
      const state = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      // Decode and manually set old timestamp, then forge new signature
      // Actually, we can't forge a valid signature, so let's test differently
      // by mocking Date.now to simulate time passing

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      const originalTimestamp = decoded.timestamp

      // Mock Date.now to return a time 11 minutes in the future
      const originalNow = Date.now
      vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp + 11 * 60 * 1000)

      try {
        const result = verifySignedState(state)
        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.error).toBe('State has expired')
        }
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('rejects state with future timestamp (clock skew > 1 minute)', () => {
      const state = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      const originalTimestamp = decoded.timestamp

      // Mock Date.now to return a time 2 minutes in the past
      vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp - 2 * 60 * 1000)

      try {
        const result = verifySignedState(state)
        expect(result.valid).toBe(false)
        if (!result.valid) {
          expect(result.error).toBe('Invalid state timestamp')
        }
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('accepts state within valid time window (under 10 minutes)', () => {
      const state = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      const originalTimestamp = decoded.timestamp

      // Mock Date.now to 9 minutes later
      vi.spyOn(Date, 'now').mockReturnValue(originalTimestamp + 9 * 60 * 1000)

      try {
        const result = verifySignedState(state)
        expect(result.valid).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('rejects state with missing fields', () => {
      const incompleteState = Buffer.from(JSON.stringify({
        userId: 'test-user',
        action: 'link'
        // Missing: provider, timestamp, nonce, sig
      })).toString('base64')

      const result = verifySignedState(incompleteState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state format')
      }
    })

    it('rejects state with wrong action', () => {
      const wrongActionState = Buffer.from(JSON.stringify({
        userId: 'test-user',
        action: 'delete', // Wrong action
        provider: 'github',
        timestamp: Date.now(),
        nonce: '00'.repeat(16),
        sig: '00'.repeat(32)
      })).toString('base64')

      const result = verifySignedState(wrongActionState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state format')
      }
    })

    it('rejects state with wrong provider', () => {
      const wrongProviderState = Buffer.from(JSON.stringify({
        userId: 'test-user',
        action: 'link',
        provider: 'twitter', // Unsupported provider
        timestamp: Date.now(),
        nonce: '00'.repeat(16),
        sig: '00'.repeat(32)
      })).toString('base64')

      const result = verifySignedState(wrongProviderState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state format')
      }
    })
  })

  describe('CSRF Attack Prevention', () => {
    it('prevents attacker from crafting state for victim', () => {
      // Simulate CSRF attack:
      // 1. Attacker knows victim's userId
      // 2. Attacker tries to craft a valid state

      const victimUserId = 'victim-user-uuid-12345'

      // Attacker cannot create a valid signature without knowing NEXTAUTH_SECRET
      const attackerCraftedState = Buffer.from(JSON.stringify({
        userId: victimUserId,
        action: 'link',
        provider: 'github',
        timestamp: Date.now(),
        nonce: 'abcd1234abcd1234abcd1234abcd1234',
        sig: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      })).toString('base64')

      const result = verifySignedState(attackerCraftedState)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid state signature')
      }
    })

    it('prevents replay attacks with old states', async () => {
      // Create a valid state
      const state = createSignedState({
        userId: 'test-user',
        action: 'link',
        provider: 'github'
      })

      // Verify it works now
      const resultNow = verifySignedState(state)
      expect(resultNow.valid).toBe(true)

      // Simulate 15 minutes passing
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'))
      vi.spyOn(Date, 'now').mockReturnValue(decoded.timestamp + 15 * 60 * 1000)

      try {
        // Same state should now be rejected
        const resultLater = verifySignedState(state)
        expect(resultLater.valid).toBe(false)
        if (!resultLater.valid) {
          expect(resultLater.error).toBe('State has expired')
        }
      } finally {
        vi.restoreAllMocks()
      }
    })
  })
})
