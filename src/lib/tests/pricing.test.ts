import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock Prisma before importing the module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: {
      findUnique: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { resolvePriceForContent } from "../pricing"

const mockResourceFindUnique = vi.mocked(prisma.resource.findUnique)
const mockCourseFindUnique = vi.mocked(prisma.course.findUnique)

describe("resolvePriceForContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("input validation", () => {
    it("returns null when both resourceId and courseId are provided", async () => {
      const result = await resolvePriceForContent({
        resourceId: "res-1",
        courseId: "course-1",
      })
      expect(result).toBeNull()
      expect(mockResourceFindUnique).not.toHaveBeenCalled()
      expect(mockCourseFindUnique).not.toHaveBeenCalled()
    })

    it("returns null when neither resourceId nor courseId is provided", async () => {
      const result = await resolvePriceForContent({})
      expect(result).toBeNull()
    })
  })

  describe("resource pricing", () => {
    it("returns database price for resource", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 1000,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({ resourceId: "res-1" })

      expect(result).toEqual({
        price: 1000,
        type: "resource",
        id: "res-1",
        noteId: "note123",
        ownerPubkey: "pubkey123",
        ownerUserId: "user-1",
        priceSource: "database",
        dbPrice: 1000,
        nostrPriceHint: 0,
      })
    })

    it("returns null when resource not found", async () => {
      mockResourceFindUnique.mockResolvedValue(null)

      const result = await resolvePriceForContent({ resourceId: "nonexistent" })

      expect(result).toBeNull()
    })

    it("falls back to Nostr price hint when database price is null", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: 500,
      })

      expect(result).toEqual({
        price: 500,
        type: "resource",
        id: "res-1",
        noteId: "note123",
        ownerPubkey: "pubkey123",
        ownerUserId: "user-1",
        priceSource: "nostr",
        dbPrice: 0,
        nostrPriceHint: 500,
      })
    })

    it("uses database price even when Nostr hint differs", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 1000,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: 500, // Different from DB price
      })

      expect(result?.price).toBe(1000)
      expect(result?.priceSource).toBe("database")
    })

    it("calls onMismatch callback when prices differ", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 1000,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const onMismatch = vi.fn()

      await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: 500,
        onMismatch,
      })

      expect(onMismatch).toHaveBeenCalledWith({
        id: "res-1",
        type: "resource",
        dbPrice: 1000,
        nostrPrice: 500,
        chosen: 1000,
      })
    })

    it("does not call onMismatch when prices match", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 1000,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const onMismatch = vi.fn()

      await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: 1000,
        onMismatch,
      })

      expect(onMismatch).not.toHaveBeenCalled()
    })

    it("handles zero price (free content)", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 0,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({ resourceId: "res-1" })

      expect(result?.price).toBe(0)
      expect(result?.priceSource).toBe("database")
    })

    it("handles missing user pubkey", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: 1000,
        noteId: "note123",
        userId: "user-1",
        user: null,
      } as any)

      const result = await resolvePriceForContent({ resourceId: "res-1" })

      expect(result?.ownerPubkey).toBeNull()
    })
  })

  describe("course pricing", () => {
    it("returns database price for course", async () => {
      mockCourseFindUnique.mockResolvedValue({
        id: "course-1",
        price: 5000,
        noteId: "coursenote123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({ courseId: "course-1" })

      expect(result).toEqual({
        price: 5000,
        type: "course",
        id: "course-1",
        noteId: "coursenote123",
        ownerPubkey: "pubkey123",
        ownerUserId: "user-1",
        priceSource: "database",
        dbPrice: 5000,
        nostrPriceHint: 0,
      })
    })

    it("returns null when course not found", async () => {
      mockCourseFindUnique.mockResolvedValue(null)

      const result = await resolvePriceForContent({ courseId: "nonexistent" })

      expect(result).toBeNull()
    })

    it("falls back to Nostr price hint when database price is null", async () => {
      mockCourseFindUnique.mockResolvedValue({
        id: "course-1",
        price: null,
        noteId: "coursenote123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        courseId: "course-1",
        nostrPriceHint: 2500,
      })

      expect(result?.price).toBe(2500)
      expect(result?.priceSource).toBe("nostr")
    })

    it("calls onMismatch callback when course prices differ", async () => {
      mockCourseFindUnique.mockResolvedValue({
        id: "course-1",
        price: 5000,
        noteId: "coursenote123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const onMismatch = vi.fn()

      await resolvePriceForContent({
        courseId: "course-1",
        nostrPriceHint: 3000,
        onMismatch,
      })

      expect(onMismatch).toHaveBeenCalledWith({
        id: "course-1",
        type: "course",
        dbPrice: 5000,
        nostrPrice: 3000,
        chosen: 5000,
      })
    })
  })

  describe("edge cases", () => {
    it("rejects negative Nostr price hint", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: -100,
      })

      // Negative prices are invalid and fall back to 0
      expect(result?.price).toBe(0)
    })

    it("handles Infinity Nostr price hint", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: Infinity,
      })

      // Infinity is not finite, so it falls back to 0
      expect(result?.price).toBe(0)
    })

    it("handles NaN Nostr price hint", async () => {
      mockResourceFindUnique.mockResolvedValue({
        id: "res-1",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "res-1",
        nostrPriceHint: NaN,
      })

      // NaN is not finite, so it falls back to 0
      expect(result?.price).toBe(0)
    })
  })

  /**
   * Price Source Security Tests
   *
   * These tests document a vulnerability where content with null DB price
   * falls back to the attacker-controlled nostrPriceHint. An attacker could
   * send nostrPrice: 0 to bypass payment requirements.
   *
   * The fix is in /api/purchases/claim/route.ts which rejects claims where
   * priceSource === "nostr".
   *
   * See: llm/implementation/purchases_plan.md
   */
  describe("Zero-Price Fallback Vulnerability", () => {
    it("documents vulnerability: null DB price with nostrPrice=0 results in free access", async () => {
      // This test documents the vulnerable scenario
      // The content has price=null in DB (edge case - schema has default 0)
      mockResourceFindUnique.mockResolvedValue({
        id: "vulnerable-resource",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      // Attacker sends nostrPrice: 0
      const result = await resolvePriceForContent({
        resourceId: "vulnerable-resource",
        nostrPriceHint: 0, // Attacker-controlled value
      })

      // The resolved price is 0 (attacker's value) and source is "nostr"
      // This means the claim route MUST reject this to prevent bypass
      expect(result?.price).toBe(0)
      expect(result?.priceSource).toBe("nostr")

      // The fix in /api/purchases/claim checks for priceSource === "nostr"
      // and rejects the claim. This test verifies the detection mechanism.
    })

    it("shows priceSource=database for properly configured content", async () => {
      // Properly configured content has DB price
      mockResourceFindUnique.mockResolvedValue({
        id: "safe-resource",
        price: 10000, // 10k sats
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      // Even if attacker sends nostrPrice: 0, DB price takes precedence
      const result = await resolvePriceForContent({
        resourceId: "safe-resource",
        nostrPriceHint: 0, // Attacker tries to set 0
      })

      // DB price is used, attacker's value ignored
      expect(result?.price).toBe(10000)
      expect(result?.priceSource).toBe("database")
    })

    it("shows free content (DB price=0) is safe and uses database source", async () => {
      // Free content explicitly has price=0 in DB
      mockResourceFindUnique.mockResolvedValue({
        id: "free-resource",
        price: 0, // Intentionally free
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "free-resource",
      })

      // Free content uses DB price (0) with source "database"
      // This is different from the attack scenario where source is "nostr"
      expect(result?.price).toBe(0)
      expect(result?.priceSource).toBe("database")
    })

    it("shows courses are also affected by the vulnerability pattern", async () => {
      // Courses can also have null prices
      mockCourseFindUnique.mockResolvedValue({
        id: "vulnerable-course",
        price: null,
        noteId: "course123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        courseId: "vulnerable-course",
        nostrPriceHint: 0,
      })

      // Same vulnerability applies to courses
      expect(result?.price).toBe(0)
      expect(result?.priceSource).toBe("nostr")
    })

    it("returns priceSource=nostr even with valid-looking nostrPrice hint", async () => {
      // An attacker might send a "reasonable" looking nostrPrice
      // to make the claim look legitimate, but it's still attacker-controlled
      mockResourceFindUnique.mockResolvedValue({
        id: "resource-no-db-price",
        price: null,
        noteId: "note123",
        userId: "user-1",
        user: { pubkey: "pubkey123" },
      } as any)

      const result = await resolvePriceForContent({
        resourceId: "resource-no-db-price",
        nostrPriceHint: 1000, // Even a "reasonable" value is untrustworthy
      })

      // The price is from nostr (untrustworthy), not database
      expect(result?.priceSource).toBe("nostr")

      // The claim route should reject ANY claim where priceSource === "nostr"
      // because the database is the canonical source of truth for pricing
    })
  })
})
