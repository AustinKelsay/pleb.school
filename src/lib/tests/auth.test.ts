import { describe, expect, it } from "vitest"
import { verifyNostrPubkey } from "../auth"

describe("auth helper functions", () => {
  describe("verifyNostrPubkey", () => {
    it("accepts valid 64-character lowercase hex pubkey", () => {
      const validPubkey = "a".repeat(64)
      expect(verifyNostrPubkey(validPubkey)).toBe(true)
    })

    it("accepts valid 64-character uppercase hex pubkey", () => {
      const validPubkey = "A".repeat(64)
      expect(verifyNostrPubkey(validPubkey)).toBe(true)
    })

    it("accepts valid mixed-case hex pubkey", () => {
      const validPubkey = "aAbBcCdDeEfF00112233445566778899" + "aAbBcCdDeEfF00112233445566778899"
      expect(verifyNostrPubkey(validPubkey)).toBe(true)
    })

    it("accepts valid pubkey with all hex digits", () => {
      const validPubkey = "0123456789abcdef".repeat(4)
      expect(verifyNostrPubkey(validPubkey)).toBe(true)
    })

    it("rejects pubkey shorter than 64 characters", () => {
      const shortPubkey = "a".repeat(63)
      expect(verifyNostrPubkey(shortPubkey)).toBe(false)
    })

    it("rejects pubkey longer than 64 characters", () => {
      const longPubkey = "a".repeat(65)
      expect(verifyNostrPubkey(longPubkey)).toBe(false)
    })

    it("rejects pubkey with non-hex characters", () => {
      const invalidPubkey = "g".repeat(64)
      expect(verifyNostrPubkey(invalidPubkey)).toBe(false)
    })

    it("rejects pubkey with special characters", () => {
      const invalidPubkey = "a".repeat(62) + "!@"
      expect(verifyNostrPubkey(invalidPubkey)).toBe(false)
    })

    it("rejects empty string", () => {
      expect(verifyNostrPubkey("")).toBe(false)
    })

    it("rejects pubkey with spaces", () => {
      const invalidPubkey = "a".repeat(32) + " " + "a".repeat(31)
      expect(verifyNostrPubkey(invalidPubkey)).toBe(false)
    })

    it("rejects npub format (bech32)", () => {
      // npub format starts with npub1 and is bech32 encoded, not hex
      const npub = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9x4cd2"
      expect(verifyNostrPubkey(npub)).toBe(false)
    })
  })
})
