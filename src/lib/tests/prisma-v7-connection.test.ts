/**
 * Prisma v7 Connection Tests (Integration)
 *
 * Verifies the pg adapter connection works correctly after the Prisma v7 upgrade.
 * These tests require a DATABASE_URL and are skipped if not available.
 *
 * Tests cover:
 * - Pool connection establishment
 * - Basic query execution
 * - Transaction completion
 * - Basic CRUD operations
 * - Clean disconnection
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

/**
 * Check if database is available for integration tests.
 * Skips if:
 * - DATABASE_URL is not set
 * - DATABASE_URL points to Docker hostname 'db' (not reachable outside Docker)
 */
function isDatabaseAvailable(): boolean {
  const url = process.env.DATABASE_URL
  if (!url) return false

  try {
    const parsed = new URL(url)
    // Skip if pointing to Docker service hostname
    if (parsed.hostname === "db") {
      return false
    }
    return true
  } catch {
    return false
  }
}

const hasDatabase = isDatabaseAvailable()

describe.skipIf(!hasDatabase)("Prisma v7 Connection (Integration)", () => {
  let prisma: PrismaClient
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
    const adapter = new PrismaPg(pool)
    prisma = new PrismaClient({ adapter })
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect().catch(() => {})
    if (pool) await pool.end().catch(() => {})
  })

  describe("Pool connection", () => {
    it("establishes pool connection", async () => {
      // Direct pool query to verify connection
      const result = await pool.query("SELECT 1 as connected")
      expect(result.rows[0].connected).toBe(1)
    })

    it("pool has expected configuration", () => {
      // Pool should be initialized
      expect(pool).toBeDefined()
      expect(pool.totalCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Raw queries", () => {
    it("executes $queryRaw successfully", async () => {
      const result = await prisma.$queryRaw<[{ version: string }]>`SELECT version()`
      expect(result).toBeDefined()
      expect(result.length).toBe(1)
      expect(result[0].version).toContain("PostgreSQL")
    })

    it("executes parameterized $queryRaw", async () => {
      const testValue = 42
      const result = await prisma.$queryRaw<[{ value: number }]>`SELECT ${testValue}::int as value`
      expect(result[0].value).toBe(testValue)
    })

    it("handles $queryRaw with multiple rows", async () => {
      const result = await prisma.$queryRaw<{ n: number }[]>`
        SELECT generate_series(1, 3) as n
      `
      expect(result.length).toBe(3)
      expect(result.map(r => r.n)).toEqual([1, 2, 3])
    })
  })

  describe("Basic CRUD operations", () => {
    it("executes findFirst on existing table", async () => {
      // This just verifies we can query a table - doesn't require data
      const result = await prisma.user.findFirst({
        select: { id: true },
      })
      // Result can be null if no users exist - that's fine
      expect(result === null || typeof result.id === "string").toBe(true)
    })

    it("executes count query", async () => {
      const count = await prisma.user.count()
      expect(typeof count).toBe("number")
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it("executes findMany with limit", async () => {
      const users = await prisma.user.findMany({
        take: 5,
        select: { id: true, createdAt: true },
      })
      expect(Array.isArray(users)).toBe(true)
      expect(users.length).toBeLessThanOrEqual(5)
    })

    it("executes findMany with ordering", async () => {
      const resources = await prisma.resource.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      })
      expect(Array.isArray(resources)).toBe(true)

      // Verify ordering if we have results
      if (resources.length > 1) {
        const dates = resources.map(r => new Date(r.createdAt).getTime())
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i])
        }
      }
    })

    it("executes findMany with where clause", async () => {
      const freeResources = await prisma.resource.findMany({
        where: { price: 0 },
        take: 5,
        select: { id: true, price: true },
      })
      expect(Array.isArray(freeResources)).toBe(true)
      freeResources.forEach(r => {
        expect(r.price).toBe(0)
      })
    })
  })

  describe("Transaction support", () => {
    it("completes a simple transaction", async () => {
      const result = await prisma.$transaction(async (tx) => {
        const count = await tx.user.count()
        return { count }
      })
      expect(typeof result.count).toBe("number")
    })

    it("completes batched transaction", async () => {
      const [userCount, resourceCount] = await prisma.$transaction([
        prisma.user.count(),
        prisma.resource.count(),
      ])
      expect(typeof userCount).toBe("number")
      expect(typeof resourceCount).toBe("number")
    })
  })

  describe("Disconnection", () => {
    it("$disconnect completes without error", async () => {
      // Create a separate client to test disconnect
      const testPool = new Pool({
        connectionString: process.env.DATABASE_URL,
      })
      const testAdapter = new PrismaPg(testPool)
      const testClient = new PrismaClient({ adapter: testAdapter })

      try {
        // Verify it works
        const count = await testClient.user.count()
        expect(typeof count).toBe("number")

        // Disconnect should complete cleanly
        await expect(testClient.$disconnect()).resolves.toBeUndefined()
      } finally {
        // Ensure resources are always cleaned up
        await testClient.$disconnect().catch(() => {})
        await testPool.end().catch(() => {})
      }
    })
  })
})
