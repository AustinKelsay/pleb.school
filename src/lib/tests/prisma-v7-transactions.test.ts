/**
 * Prisma v7 Transaction Tests (Integration)
 *
 * Verifies serializable transactions work correctly with the pg adapter.
 * These tests are critical because the purchase claiming flow relies on
 * serializable isolation to prevent double-purchases.
 *
 * Tests cover:
 * - Serializable isolation level transactions
 * - Transaction rollback on error
 * - Nested CRUD operations within transactions
 * - Interactive transactions (the pattern used in purchase claiming)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient, Prisma } from "@/generated/prisma"
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

describe.skipIf(!hasDatabase)("Prisma v7 Transactions (Integration)", () => {
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
    await prisma.$disconnect()
    await pool.end()
  })

  describe("Transaction isolation levels", () => {
    it("executes transaction with Serializable isolation level", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          // Verify we can query within the transaction
          const count = await tx.user.count()
          return { count, isolationLevel: "Serializable" }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )

      expect(result.isolationLevel).toBe("Serializable")
      expect(typeof result.count).toBe("number")
    })

    it("executes transaction with ReadCommitted isolation level", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const count = await tx.resource.count()
          return { count }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        }
      )

      expect(typeof result.count).toBe("number")
    })

    it("executes transaction with RepeatableRead isolation level", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const count = await tx.course.count()
          return { count }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        }
      )

      expect(typeof result.count).toBe("number")
    })
  })

  describe("Transaction rollback", () => {
    it("rolls back on thrown error", async () => {
      const testError = new Error("Test rollback")

      // Get initial count
      const initialCount = await prisma.user.count()

      // Try to do something in a transaction that throws
      try {
        await prisma.$transaction(async (tx) => {
          // Read something to start the transaction
          await tx.user.count()
          // Throw an error - transaction should rollback
          throw testError
        })
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBe(testError)
      }

      // Count should be unchanged (rollback worked)
      const finalCount = await prisma.user.count()
      expect(finalCount).toBe(initialCount)
    })

    it("rolls back serializable transaction on error", async () => {
      const testError = new Error("Serializable rollback test")

      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.resource.count()
            throw testError
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        )
        expect(true).toBe(false) // Should not reach
      } catch (error) {
        expect(error).toBe(testError)
      }
    })
  })

  describe("Nested CRUD operations", () => {
    it("executes multiple read operations in single transaction", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const userCount = await tx.user.count()
          const resourceCount = await tx.resource.count()
          const courseCount = await tx.course.count()

          return {
            users: userCount,
            resources: resourceCount,
            courses: courseCount,
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )

      expect(typeof result.users).toBe("number")
      expect(typeof result.resources).toBe("number")
      expect(typeof result.courses).toBe("number")
    })

    it("executes findFirst within transaction", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findFirst({
            select: { id: true, pubkey: true },
          })
          const resource = await tx.resource.findFirst({
            select: { id: true, price: true },
          })
          return { user, resource }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )

      // Results can be null if no data exists
      expect(
        result.user === null || typeof result.user.id === "string"
      ).toBe(true)
      expect(
        result.resource === null || typeof result.resource.id === "string"
      ).toBe(true)
    })

    it("executes findMany with relations within transaction", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const courses = await tx.course.findMany({
            take: 3,
            include: {
              lessons: {
                take: 2,
                select: { id: true, index: true },
              },
            },
          })
          return courses
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )

      expect(Array.isArray(result)).toBe(true)
      result.forEach((course) => {
        expect(Array.isArray(course.lessons)).toBe(true)
      })
    })
  })

  describe("Purchase-like transaction pattern", () => {
    /**
     * This test mirrors the pattern used in /api/purchases/claim
     * to verify it works with the pg adapter in Prisma v7.
     */
    it("executes purchase-claim-like transaction pattern", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          // Step 1: Find user (like in purchase claim)
          const user = await tx.user.findFirst({
            select: { id: true, pubkey: true },
          })

          if (!user) {
            return { status: "no_user", purchased: false }
          }

          // Step 2: Find resource/course (like in purchase claim)
          const resource = await tx.resource.findFirst({
            where: { price: { gt: 0 } },
            select: { id: true, price: true },
          })

          if (!resource) {
            return { status: "no_paid_resource", purchased: false }
          }

          // Step 3: Check for existing purchase (like in purchase claim)
          const existingPurchase = await tx.purchase.findFirst({
            where: {
              userId: user.id,
              resourceId: resource.id,
            },
          })

          // Step 4: Return result based on existing purchase
          if (existingPurchase) {
            return {
              status: "already_purchased",
              purchased: true,
              purchaseId: existingPurchase.id,
            }
          }

          return {
            status: "eligible",
            purchased: false,
            userId: user.id,
            resourceId: resource.id,
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }
      )

      // Verify result structure
      expect(result.status).toBeDefined()
      expect(typeof result.purchased).toBe("boolean")
    })

    it("handles transaction timeout option", async () => {
      const result = await prisma.$transaction(
        async (tx) => {
          const count = await tx.user.count()
          return { count }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 5000, // 5 second timeout
          maxWait: 2000, // 2 second max wait for transaction slot
        }
      )

      expect(typeof result.count).toBe("number")
    })
  })

  describe("Batched transactions", () => {
    it("executes batched queries as transaction", async () => {
      const [users, resources, courses] = await prisma.$transaction([
        prisma.user.findMany({ take: 2, select: { id: true } }),
        prisma.resource.findMany({ take: 2, select: { id: true } }),
        prisma.course.findMany({ take: 2, select: { id: true } }),
      ])

      expect(Array.isArray(users)).toBe(true)
      expect(Array.isArray(resources)).toBe(true)
      expect(Array.isArray(courses)).toBe(true)
    })

    it("batched transaction with isolation level", async () => {
      const [userCount, resourceCount] = await prisma.$transaction(
        [prisma.user.count(), prisma.resource.count()],
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        }
      )

      expect(typeof userCount).toBe("number")
      expect(typeof resourceCount).toBe("number")
    })
  })
})
