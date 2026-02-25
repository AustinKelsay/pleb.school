import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => {
  const auditLog = {
    create: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  }
  const $queryRawLockAcquired = vi.fn().mockResolvedValue([{ pg_try_advisory_xact_lock: true }])
  const $transactionImpl = (fn: (tx: { auditLog: typeof auditLog; $queryRaw: (template: any) => Promise<any> }) => Promise<any>) =>
    fn({
      auditLog,
      $queryRaw: $queryRawLockAcquired,
    })
  return {
    prisma: {
      auditLog,
      $transaction: vi.fn($transactionImpl),
    },
  }
})

import { prisma } from "@/lib/prisma"
import {
  AUDIT_LOG_DELETE_BATCH_SIZE,
  AUDIT_LOG_PURGE_TX_MAX_WAIT_MS,
  AUDIT_LOG_PURGE_TX_TIMEOUT_MS,
  AuditLogAdapter,
} from "../db-adapter"

describe("AuditLogAdapter.deleteOlderThan", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("throws for future cutoffs and does not execute deleteMany", async () => {
    const transactionMock = vi.mocked(prisma.$transaction)
    const findManyMock = vi.mocked(prisma.auditLog.findMany)
    const deleteManyMock = vi.mocked(prisma.auditLog.deleteMany)
    const futureCutoff = new Date(Date.now() + 60_000)

    await expect(AuditLogAdapter.deleteOlderThan(futureCutoff)).rejects.toThrow(
      "cutoff must not be in the future."
    )
    expect(transactionMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("throws for invalid cutoffs and does not execute deleteMany", async () => {
    const transactionMock = vi.mocked(prisma.$transaction)
    const findManyMock = vi.mocked(prisma.auditLog.findMany)
    const deleteManyMock = vi.mocked(prisma.auditLog.deleteMany)
    const invalidCutoff = new Date("not-a-real-date")

    await expect(AuditLogAdapter.deleteOlderThan(invalidCutoff)).rejects.toThrow(
      "cutoff must be a valid Date."
    )
    expect(transactionMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("returns 0 when advisory lock cannot be acquired (another worker holds it)", async () => {
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) =>
      fn({
        auditLog: prisma.auditLog,
        $queryRaw: () => Promise.resolve([{ pg_try_advisory_xact_lock: false }]),
      } as any)
    )

    const cutoff = new Date(Date.now() - 60_000)
    const result = await AuditLogAdapter.deleteOlderThan(cutoff)

    expect(result).toBe(0)
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes rows for valid past cutoffs in batches", async () => {
    const findManyMock = vi.mocked(prisma.auditLog.findMany)
    const deleteManyMock = vi.mocked(prisma.auditLog.deleteMany)
    const cutoff = new Date(Date.now() - 60_000)

    findManyMock
      .mockResolvedValueOnce([{ id: "log-1" }, { id: "log-2" }] as any)
      .mockResolvedValueOnce([] as any)
    deleteManyMock.mockResolvedValue({ count: 2 } as { count: number })

    const result = await AuditLogAdapter.deleteOlderThan(cutoff)

    expect(result).toBe(2)
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
      select: { id: true },
      take: AUDIT_LOG_DELETE_BATCH_SIZE,
    })
    expect(deleteManyMock).toHaveBeenCalledTimes(1)
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["log-1", "log-2"] },
      },
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxWait: AUDIT_LOG_PURGE_TX_MAX_WAIT_MS,
        timeout: AUDIT_LOG_PURGE_TX_TIMEOUT_MS,
      })
    )
  })
})
