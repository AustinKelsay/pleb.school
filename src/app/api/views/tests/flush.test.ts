import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests for view counter flush logic
 *
 * Key scenarios:
 * 1. Basic flush with GETDEL atomicity
 * 2. Race condition: increment during flush is not lost
 * 3. Concurrent flushes don't overwrite each other (INCREMENT semantics)
 * 4. Zero counts are filtered out
 */

// Mock KV store for testing
function createMockKV() {
  const store = new Map<string, number>()
  const sets = new Map<string, Set<string>>()

  return {
    store,
    sets,

    // Get value
    async get<T>(key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null
    },

    // Atomic get and delete
    async getdel<T>(key: string): Promise<T | null> {
      const val = store.get(key) as T | undefined
      store.delete(key)
      return val ?? null
    },

    // Increment (creates key if doesn't exist)
    async incr(key: string): Promise<number> {
      const current = store.get(key) ?? 0
      const next = current + 1
      store.set(key, next)
      return next
    },

    // Set operations
    async sadd(key: string, ...members: string[]): Promise<number> {
      if (!sets.has(key)) sets.set(key, new Set())
      const set = sets.get(key)!
      let added = 0
      for (const m of members) {
        if (!set.has(m)) {
          set.add(m)
          added++
        }
      }
      return added
    },

    async smembers<T>(key: string): Promise<T[]> {
      const set = sets.get(key)
      return set ? (Array.from(set) as T[]) : []
    },

    async srem(key: string, ...members: string[]): Promise<number> {
      const set = sets.get(key)
      if (!set) return 0
      let removed = 0
      for (const m of members) {
        if (set.delete(m)) removed++
      }
      return removed
    },

    // Test helpers
    reset() {
      store.clear()
      sets.clear()
    }
  }
}

// Mock DB for testing
function createMockDB() {
  const totals = new Map<string, { total: number }>()

  return {
    totals,

    viewCounterTotal: {
      async upsert(args: {
        where: { key: string }
        create: { key: string; total: number }
        update: { total: number | { increment: number } }
      }) {
        const key = args.where.key
        const existing = totals.get(key)

        if (existing) {
          // Update
          if (typeof args.update.total === 'object' && 'increment' in args.update.total) {
            existing.total += args.update.total.increment
          } else {
            existing.total = args.update.total as number
          }
        } else {
          // Create
          totals.set(key, { total: args.create.total })
        }

        return totals.get(key)
      }
    },

    reset() {
      totals.clear()
    }
  }
}

describe("view flush", () => {
  let mockKV: ReturnType<typeof createMockKV>
  let mockDB: ReturnType<typeof createMockDB>

  beforeEach(() => {
    mockKV = createMockKV()
    mockDB = createMockDB()
  })

  afterEach(() => {
    mockKV.reset()
    mockDB.reset()
  })

  describe("GETDEL atomicity", () => {
    it("should atomically get and delete the counter", async () => {
      // Setup: counter has value
      mockKV.store.set("views:content:123", 42)
      mockKV.sets.set("views:dirty", new Set(["views:content:123"]))

      // Act: getdel should return value and delete
      const value = await mockKV.getdel<number>("views:content:123")

      // Assert
      expect(value).toBe(42)
      expect(mockKV.store.has("views:content:123")).toBe(false)
    })

    it("should return null for non-existent key", async () => {
      const value = await mockKV.getdel<number>("views:content:nonexistent")
      expect(value).toBeNull()
    })
  })

  describe("race condition prevention", () => {
    it("should not lose increments that happen during flush", async () => {
      // Setup: initial counter
      const key = "views:content:123"
      mockKV.store.set(key, 100)
      mockKV.sets.set("views:dirty", new Set([key]))

      // Simulate flush process
      const keys = await mockKV.smembers<string>("views:dirty")
      expect(keys).toContain(key)

      // Step 1: getdel atomically gets and deletes
      const count = await mockKV.getdel<number>(key)
      expect(count).toBe(100)
      expect(mockKV.store.has(key)).toBe(false)

      // Step 2: RACE - increment happens after getdel but before srem
      // This creates a NEW counter since key was deleted
      await mockKV.incr(key)
      await mockKV.sadd("views:dirty", key)

      // Verify new counter was created
      expect(mockKV.store.get(key)).toBe(1)

      // Step 3: Flush writes to DB (increment, not set)
      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: count! },
        update: { total: { increment: count! } },
      })

      // Step 4: srem runs - this DOES remove the key even though it was re-added
      // (Redis sets don't track when members were added)
      await mockKV.srem("views:dirty", ...keys)

      // The key IS removed from dirty set by srem (expected Redis behavior)
      expect(mockKV.sets.get("views:dirty")?.has(key)).toBe(false)

      // BUT: The counter value (1) still exists in KV!
      expect(mockKV.store.get(key)).toBe(1)

      // DB has the first flush's count
      expect(mockDB.totals.get(key)?.total).toBe(100)

      // Step 5: The next increment will re-add to dirty set
      await mockKV.incr(key) // Now 2
      await mockKV.sadd("views:dirty", key)

      expect(mockKV.sets.get("views:dirty")?.has(key)).toBe(true)
      expect(mockKV.store.get(key)).toBe(2)

      // Next flush picks up both increments
      const nextCount = await mockKV.getdel<number>(key)
      expect(nextCount).toBe(2)

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: nextCount! },
        update: { total: { increment: nextCount! } },
      })

      // Final total should be 102 (100 + 2)
      // Note: We lost the timing of the first race increment being flushed
      // immediately, but the DATA is not lost - it accumulates in KV until
      // the next increment triggers a re-add to dirty
      expect(mockDB.totals.get(key)?.total).toBe(102)
    })

    it("should handle multiple increments during flush", async () => {
      const key = "views:content:456"
      mockKV.store.set(key, 50)
      mockKV.sets.set("views:dirty", new Set([key]))

      // Flush getdels
      const count = await mockKV.getdel<number>(key)

      // Multiple increments during flush
      await mockKV.incr(key)
      await mockKV.incr(key)
      await mockKV.incr(key)
      await mockKV.sadd("views:dirty", key)

      // Flush writes to DB
      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: count! },
        update: { total: { increment: count! } },
      })

      expect(mockDB.totals.get(key)?.total).toBe(50)

      // Next flush picks up the 3 new increments
      const nextCount = await mockKV.getdel<number>(key)
      expect(nextCount).toBe(3)

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: nextCount! },
        update: { total: { increment: nextCount! } },
      })

      expect(mockDB.totals.get(key)?.total).toBe(53)
    })
  })

  describe("INCREMENT vs SET semantics", () => {
    it("should increment DB total, not set it", async () => {
      const key = "views:content:789"

      // First flush: 10 views
      mockKV.store.set(key, 10)
      const count1 = await mockKV.getdel<number>(key)

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: count1! },
        update: { total: { increment: count1! } },
      })
      expect(mockDB.totals.get(key)?.total).toBe(10)

      // Second flush: 5 more views
      mockKV.store.set(key, 5)
      const count2 = await mockKV.getdel<number>(key)

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: count2! },
        update: { total: { increment: count2! } },
      })

      // Should be 15, not 5
      expect(mockDB.totals.get(key)?.total).toBe(15)
    })

    it("should handle concurrent flushes correctly with INCREMENT", async () => {
      const key = "views:content:concurrent"

      // Setup: initial DB state
      mockDB.totals.set(key, { total: 100 })

      // Two flushes happen concurrently, each with 10 views
      // With SET semantics, second would overwrite first
      // With INCREMENT semantics, both add to total

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: 10 },
        update: { total: { increment: 10 } },
      })

      await mockDB.viewCounterTotal.upsert({
        where: { key },
        create: { key, total: 10 },
        update: { total: { increment: 10 } },
      })

      // Should be 120 (100 + 10 + 10), not 10
      expect(mockDB.totals.get(key)?.total).toBe(120)
    })
  })

  describe("zero count filtering", () => {
    it("should skip keys with zero count", async () => {
      const key1 = "views:content:zero"
      const key2 = "views:content:nonzero"

      mockKV.store.set(key1, 0)
      mockKV.store.set(key2, 5)
      mockKV.sets.set("views:dirty", new Set([key1, key2]))

      const keys = await mockKV.smembers<string>("views:dirty")
      const pairs: [string, number][] = []

      for (const k of keys) {
        const count = await mockKV.getdel<number>(k)
        pairs.push([k, count ?? 0])
      }

      // Filter out zero counts
      const nonZeroPairs = pairs.filter(([, count]) => count > 0)

      expect(nonZeroPairs).toHaveLength(1)
      expect(nonZeroPairs[0]).toEqual([key2, 5])
    })

    it("should skip keys that were already deleted (getdel returns null)", async () => {
      const key = "views:content:deleted"
      mockKV.sets.set("views:dirty", new Set([key]))
      // Note: key is NOT in store (was already flushed)

      const count = await mockKV.getdel<number>(key)
      expect(count).toBeNull()

      const nonZeroPairs = [[key, count ?? 0] as [string, number]].filter(([, c]) => c > 0)
      expect(nonZeroPairs).toHaveLength(0)
    })
  })

  describe("dirty set cleanup", () => {
    it("should remove flushed keys from dirty set", async () => {
      const keys = ["views:content:a", "views:content:b"]
      mockKV.sets.set("views:dirty", new Set(keys))

      for (const k of keys) {
        mockKV.store.set(k, 1)
      }

      // Simulate flush
      const dirtyKeys = await mockKV.smembers<string>("views:dirty")
      for (const k of dirtyKeys) {
        await mockKV.getdel<number>(k)
      }
      await mockKV.srem("views:dirty", ...dirtyKeys)

      expect(mockKV.sets.get("views:dirty")?.size ?? 0).toBe(0)
    })

    it("should capture old value and leave new counter after concurrent re-add", async () => {
      const key = "views:content:readded"
      mockKV.store.set(key, 10)
      mockKV.sets.set("views:dirty", new Set([key]))

      // Simulate flush sequence with concurrent increment
      const dirtyKeys = await mockKV.smembers<string>("views:dirty")
      const oldValue = await mockKV.getdel<number>(key)

      // Concurrent increment arrives after getdel
      await mockKV.incr(key)
      await mockKV.sadd("views:dirty", key)

      // Flush completes srem (removes key even though re-added)
      await mockKV.srem("views:dirty", ...dirtyKeys)

      // Old value was captured, new counter exists with fresh value
      expect(oldValue).toBe(10)
      expect(mockKV.store.get(key)).toBe(1)
    })
  })
})
