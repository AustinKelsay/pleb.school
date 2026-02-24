import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Rate Limit Tests
 *
 * Tests the fail-open/fail-closed behavior when Vercel KV is unavailable.
 * Mocks the @vercel/kv module to simulate KV failures.
 */

// Mock @vercel/kv before importing the module under test
vi.mock("@vercel/kv", () => ({
  kv: {
    eval: vi.fn(),
  },
}))

const MODULE_PATH = "../rate-limit"

// Store original env values to restore after tests
const originalEnv = {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  NODE_ENV: process.env.NODE_ENV,
}
const mutableEnv = process.env as Record<string, string | undefined>

function restoreEnv() {
  if (originalEnv.KV_REST_API_URL === undefined) {
    delete process.env.KV_REST_API_URL
  } else {
    process.env.KV_REST_API_URL = originalEnv.KV_REST_API_URL
  }
  if (originalEnv.KV_REST_API_TOKEN === undefined) {
    delete process.env.KV_REST_API_TOKEN
  } else {
    process.env.KV_REST_API_TOKEN = originalEnv.KV_REST_API_TOKEN
  }
  if (originalEnv.NODE_ENV === undefined) {
    delete mutableEnv.NODE_ENV
  } else {
    mutableEnv.NODE_ENV = originalEnv.NODE_ENV
  }
}

async function loadModuleWithKV(hasKV: boolean, nodeEnv: string = "test") {
  vi.resetModules()

  // Set env vars to control hasKV detection
  if (hasKV) {
    process.env.KV_REST_API_URL = "https://fake-kv.vercel.app"
    process.env.KV_REST_API_TOKEN = "fake-token"
  } else {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  }
  mutableEnv.NODE_ENV = nodeEnv

  // Re-mock after resetModules
  vi.doMock("@vercel/kv", () => ({
    kv: {
      eval: vi.fn(),
    },
  }))

  return import(MODULE_PATH)
}

describe("rate-limit", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    restoreEnv()
  })

  describe("KV failure handling", () => {
    it("allows requests when KV unavailable and failOpen=true", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and make it throw
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockRejectedValue(new Error("KV connection failed"))

      // Call with failOpen=true
      const result = await checkRateLimit("test-key", 10, 60, { failOpen: true })

      // Should allow the request
      expect(result.success).toBe(true)
      expect(result.remaining).toBe(10)
      expect(result.resetIn).toBe(60)

      // Should have logged the error
      expect(console.error).toHaveBeenCalledWith(
        "Rate limit check failed:",
        expect.any(Error)
      )
    })

    it("blocks requests when KV unavailable and failOpen=false", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and make it throw
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockRejectedValue(new Error("KV connection failed"))

      // Call with failOpen=false (default behavior)
      const result = await checkRateLimit("test-key", 10, 60, { failOpen: false })

      // Should block the request
      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.resetIn).toBe(60)

      // Should have logged the error
      expect(console.error).toHaveBeenCalledWith(
        "Rate limit check failed:",
        expect.any(Error)
      )
    })

    it("blocks requests when KV unavailable and no options provided (default fail-closed)", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and make it throw
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockRejectedValue(new Error("KV connection failed"))

      // Call without options (should default to fail-closed)
      const result = await checkRateLimit("test-key", 10, 60)

      // Should block the request (fail-closed is default)
      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it("does not write to KV during KV failure", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and make it throw
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockRejectedValue(new Error("KV connection failed"))

      // Call the rate limiter
      await checkRateLimit("test-key", 10, 60, { failOpen: true })

      // kv.eval should have been called exactly once (the failed attempt)
      // No retry or additional writes should occur
      expect(kv.eval).toHaveBeenCalledTimes(1)
    })
  })

  describe("KV success path", () => {
    it("returns correct rate limit info when KV succeeds", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and make it succeed
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockResolvedValue([3, 45]) // count=3, ttl=45

      const result = await checkRateLimit("test-key", 10, 60)

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(7) // 10 - 3
      expect(result.resetIn).toBe(45)
    })

    it("returns failure when rate limit exceeded", async () => {
      // Load module with KV enabled
      const { checkRateLimit } = await loadModuleWithKV(true)

      // Get the mocked kv.eval and return count > limit
      const { kv } = await import("@vercel/kv")
      vi.mocked(kv.eval).mockResolvedValue([15, 30]) // count=15 exceeds limit=10

      const result = await checkRateLimit("test-key", 10, 60)

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.resetIn).toBe(30)
    })
  })

  describe("memory fallback (no KV configured)", () => {
    it("uses in-memory rate limiting when KV is not configured", async () => {
      // Load module without KV
      const { checkRateLimit } = await loadModuleWithKV(false)

      // First request should succeed
      const result1 = await checkRateLimit("memory-test", 3, 60)
      expect(result1.success).toBe(true)
      expect(result1.remaining).toBe(2)

      // Second request should succeed
      const result2 = await checkRateLimit("memory-test", 3, 60)
      expect(result2.success).toBe(true)
      expect(result2.remaining).toBe(1)

      // Third request should succeed
      const result3 = await checkRateLimit("memory-test", 3, 60)
      expect(result3.success).toBe(true)
      expect(result3.remaining).toBe(0)

      // Fourth request should fail (exceeded limit)
      const result4 = await checkRateLimit("memory-test", 3, 60)
      expect(result4.success).toBe(false)
      expect(result4.remaining).toBe(0)
    })
  })

  describe("production configuration safety", () => {
    it("fails closed in production when KV is missing", async () => {
      const { checkRateLimit } = await loadModuleWithKV(false, "production")

      const result = await checkRateLimit("prod-no-kv", 5, 60)

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.resetIn).toBe(60)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Rate limiting misconfigured")
      )
    })

    it("can fail-open explicitly in production when KV is missing", async () => {
      const { checkRateLimit } = await loadModuleWithKV(false, "production")

      const result = await checkRateLimit("prod-no-kv-fail-open", 5, 60, { failOpen: true })

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(5)
      expect(result.resetIn).toBe(60)
    })
  })
})
