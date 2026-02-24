import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/prisma"
import { AuditLogAdapter } from "../db-adapter"

describe("AuditLogAdapter.deleteOlderThan", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("throws for future cutoffs and does not execute deleteMany", async () => {
    const deleteManyMock = vi.mocked(prisma.auditLog.deleteMany)
    const futureCutoff = new Date(Date.now() + 60_000)

    await expect(AuditLogAdapter.deleteOlderThan(futureCutoff)).rejects.toThrow(
      "cutoff must not be in the future."
    )
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("deletes rows for valid past cutoffs", async () => {
    const deleteManyMock = vi.mocked(prisma.auditLog.deleteMany)
    deleteManyMock.mockResolvedValue({ count: 7 } as { count: number })

    const result = await AuditLogAdapter.deleteOlderThan(new Date(Date.now() - 60_000))

    expect(result).toBe(7)
    expect(deleteManyMock).toHaveBeenCalledTimes(1)
  })
})
