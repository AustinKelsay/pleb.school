import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { prisma } from "@/lib/prisma"
import logger from "@/lib/logger"
import { auditLog } from "../audit-logger"

const mockAuditCreate = vi.mocked(prisma.auditLog.create)
const mockLoggerInfo = vi.mocked(logger.info)
const mockLoggerError = vi.mocked(logger.error)

describe("auditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditCreate.mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("persists structured audit events to the database", async () => {
    await auditLog("user-123", "account.unlink", { provider: "github", success: true })

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        action: "account.unlink",
        details: { provider: "github", success: true },
        ip: undefined,
        userAgent: undefined,
      },
    })
    expect(mockLoggerInfo).toHaveBeenCalled()
  })

  it("normalizes non-JSON-safe values in details", async () => {
    const circular: Record<string, unknown> = { flag: true, count: BigInt(42) }
    circular.self = circular

    await auditLog("user-123", "purchase.claim", circular)

    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-123",
        action: "purchase.claim",
        details: {
          flag: true,
          count: "42",
          self: "[Circular]",
        },
        ip: undefined,
        userAgent: undefined,
      },
    })
  })

  it("does not throw when database persistence fails", async () => {
    mockAuditCreate.mockRejectedValue(new Error("db unavailable"))

    await expect(
      auditLog("user-123", "purchase.claim.failed", { error: "boom" })
    ).resolves.toBeUndefined()

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to persist audit log event",
      expect.objectContaining({ userId: "user-123", action: "purchase.claim.failed" })
    )
  })
})
