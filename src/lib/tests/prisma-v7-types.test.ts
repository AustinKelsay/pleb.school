/**
 * Prisma v7 Type Exports Tests
 *
 * Verifies the new import paths and type exports work correctly
 * after upgrading from Prisma 6 to 7 with the @prisma/adapter-pg adapter.
 *
 * These tests run without database connectivity - they just verify
 * that types and exports are accessible from @/generated/prisma.
 */

import { describe, expect, it } from "vitest"
import {
  PrismaClient,
  Prisma,
} from "@/generated/prisma"

describe("Prisma v7 Type Exports", () => {
  describe("PrismaClient", () => {
    it("exports PrismaClient constructor", () => {
      expect(PrismaClient).toBeDefined()
      expect(typeof PrismaClient).toBe("function")
    })
  })

  describe("Prisma namespace", () => {
    it("exports Prisma namespace", () => {
      expect(Prisma).toBeDefined()
      expect(typeof Prisma).toBe("object")
    })

    it("exports TransactionIsolationLevel enum", () => {
      expect(Prisma.TransactionIsolationLevel).toBeDefined()
      expect(typeof Prisma.TransactionIsolationLevel).toBe("object")
    })

    it("exports TransactionIsolationLevel.Serializable (critical for purchase claiming)", () => {
      expect(Prisma.TransactionIsolationLevel.Serializable).toBe("Serializable")
    })

    it("exports all transaction isolation levels", () => {
      expect(Prisma.TransactionIsolationLevel.ReadUncommitted).toBe("ReadUncommitted")
      expect(Prisma.TransactionIsolationLevel.ReadCommitted).toBe("ReadCommitted")
      expect(Prisma.TransactionIsolationLevel.RepeatableRead).toBe("RepeatableRead")
      expect(Prisma.TransactionIsolationLevel.Serializable).toBe("Serializable")
    })
  })

  describe("JSON types", () => {
    it("JsonArray type exists and can be used", () => {
      // Type-level check - if this compiles without error, it passes
      const jsonArray: Prisma.JsonArray = ["test", 123, true, null]
      expect(jsonArray).toBeDefined()
      expect(Array.isArray(jsonArray)).toBe(true)
    })

    it("JsonObject type exists and can be used", () => {
      const jsonObject: Prisma.JsonObject = {
        key: "value",
        number: 42,
        nested: { inner: true },
      }
      expect(jsonObject).toBeDefined()
      expect(typeof jsonObject).toBe("object")
    })

    it("InputJsonValue type accepts various JSON-compatible values", () => {
      // These should all compile and work at runtime
      const stringValue: Prisma.InputJsonValue = "string"
      const numberValue: Prisma.InputJsonValue = 123
      const booleanValue: Prisma.InputJsonValue = true
      const arrayValue: Prisma.InputJsonValue = [1, 2, 3]
      const objectValue: Prisma.InputJsonValue = { key: "value" }

      expect(stringValue).toBe("string")
      expect(numberValue).toBe(123)
      expect(booleanValue).toBe(true)
      expect(arrayValue).toEqual([1, 2, 3])
      expect(objectValue).toEqual({ key: "value" })
    })

    it("InputJsonArray type accepts arrays", () => {
      const array: Prisma.InputJsonArray = [
        "string",
        123,
        true,
        { nested: "object" },
        [1, 2, 3],
      ]
      expect(array.length).toBe(5)
    })

    it("InputJsonObject type accepts objects with optional/undefined values", () => {
      const obj: Prisma.InputJsonObject = {
        required: "value",
        optional: undefined,
        nullable: null,
      }
      expect(obj.required).toBe("value")
      expect(obj.optional).toBeUndefined()
      expect(obj.nullable).toBeNull()
    })
  })

  describe("Error classes", () => {
    it("exports Prisma.PrismaClientKnownRequestError class", () => {
      expect(Prisma.PrismaClientKnownRequestError).toBeDefined()
      expect(typeof Prisma.PrismaClientKnownRequestError).toBe("function")
    })

    it("Prisma.PrismaClientKnownRequestError can be used in instanceof checks", () => {
      // Create a mock error to test instanceof
      const error = new Prisma.PrismaClientKnownRequestError("Test error", {
        code: "P2002",
        clientVersion: "7.0.0",
      })

      expect(error instanceof Prisma.PrismaClientKnownRequestError).toBe(true)
      expect(error.code).toBe("P2002")
      expect(error.message).toContain("Test error")
    })
  })

  describe("Model types", () => {
    it("exports CourseInclude type for query includes", () => {
      // Type check - if this compiles, it passes
      const include: Prisma.CourseInclude = {
        user: true,
        purchases: true,
        lessons: true,
      }
      expect(include).toBeDefined()
    })

    it("exports ResourceWhereInput type for query filters", () => {
      const where: Prisma.ResourceWhereInput = {
        price: { gt: 0 },
        userId: "test-user",
      }
      expect(where).toBeDefined()
    })

    it("exports UserSelect type for field selection", () => {
      const select: Prisma.UserSelect = {
        id: true,
        username: true,
        pubkey: true,
      }
      expect(select).toBeDefined()
    })
  })
})
