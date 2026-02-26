import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db-adapter", () => ({
  AuditLogAdapter: {
    deleteOlderThan: vi.fn(),
    anonymizeByUserId: vi.fn(),
  },
}))

import { AuditLogAdapter } from "@/lib/db-adapter"
import {
  anonymizeAuditLogsForUser,
  getAuditLogCutoffDate,
  purgeExpiredAuditLogs,
  resolveAuditLogRetentionDays,
} from "../audit-log-maintenance"

const mockDeleteOlderThan = vi.mocked(AuditLogAdapter.deleteOlderThan)
const mockAnonymizeByUserId = vi.mocked(AuditLogAdapter.anonymizeByUserId)

const originalRetentionDays = process.env.AUDIT_LOG_RETENTION_DAYS

function makeEnv(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  } as NodeJS.ProcessEnv
}

describe("audit-log-maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteOlderThan.mockResolvedValue(0)
    mockAnonymizeByUserId.mockResolvedValue(0)
  })

  afterEach(() => {
    if (originalRetentionDays === undefined) {
      delete process.env.AUDIT_LOG_RETENTION_DAYS
    } else {
      process.env.AUDIT_LOG_RETENTION_DAYS = originalRetentionDays
    }
  })

  it("uses the default retention when env is unset", () => {
    expect(resolveAuditLogRetentionDays(makeEnv({}))).toBe(90)
  })

  it("parses and trims valid retention values", () => {
    expect(
      resolveAuditLogRetentionDays(makeEnv({
        AUDIT_LOG_RETENTION_DAYS: " 120 ",
      }))
    ).toBe(120)
  })

  it("falls back to default retention for invalid values in non-strict mode", () => {
    expect(
      resolveAuditLogRetentionDays(makeEnv({
        AUDIT_LOG_RETENTION_DAYS: "0",
      }))
    ).toBe(90)
  })

  it("rejects mixed digit/non-digit input like 90abc (non-strict falls back to default)", () => {
    expect(
      resolveAuditLogRetentionDays(makeEnv({
        AUDIT_LOG_RETENTION_DAYS: "90abc",
      }))
    ).toBe(90)
  })

  it("throws for invalid values in strict mode", () => {
    expect(() =>
      resolveAuditLogRetentionDays(
        makeEnv({
          AUDIT_LOG_RETENTION_DAYS: "not-a-number",
        }),
        { strict: true }
      )
    ).toThrow("AUDIT_LOG_RETENTION_DAYS must be an integer between 1 and 3650.")
  })

  it("throws for mixed digit/non-digit input in strict mode", () => {
    expect(() =>
      resolveAuditLogRetentionDays(
        makeEnv({ AUDIT_LOG_RETENTION_DAYS: "90abc" }),
        { strict: true }
      )
    ).toThrow("AUDIT_LOG_RETENTION_DAYS must be an integer between 1 and 3650.")
  })

  it("computes the cutoff date from retention days", () => {
    const now = new Date("2026-02-24T00:00:00.000Z")
    const cutoff = getAuditLogCutoffDate(30, now)
    expect(cutoff.toISOString()).toBe("2026-01-25T00:00:00.000Z")
  })

  it("throws when getAuditLogCutoffDate receives invalid retention days", () => {
    const now = new Date("2026-02-24T00:00:00.000Z")
    expect(() => getAuditLogCutoffDate(0, now)).toThrow(
      "retentionDays must be an integer between 1 and 3650."
    )
    expect(() => getAuditLogCutoffDate(-1, now)).toThrow(
      "retentionDays must be an integer between 1 and 3650."
    )
    expect(() => getAuditLogCutoffDate(1.5, now)).toThrow(
      "retentionDays must be an integer between 1 and 3650."
    )
  })

  it("throws when getAuditLogCutoffDate receives an invalid now date", () => {
    expect(() => getAuditLogCutoffDate(30, new Date("invalid"))).toThrow(
      "now must be a valid Date."
    )
  })

  it("purges records older than computed cutoff and returns summary", async () => {
    const now = new Date("2026-02-24T10:00:00.000Z")
    mockDeleteOlderThan.mockResolvedValue(7)

    const summary = await purgeExpiredAuditLogs({
      retentionDays: 10,
      now,
    })

    expect(mockDeleteOlderThan).toHaveBeenCalledTimes(1)
    const cutoffArg = mockDeleteOlderThan.mock.calls[0]?.[0]
    expect(cutoffArg).toBeInstanceOf(Date)
    expect(cutoffArg?.toISOString()).toBe("2026-02-14T10:00:00.000Z")
    expect(summary).toEqual({
      retentionDays: 10,
      cutoff: new Date("2026-02-14T10:00:00.000Z"),
      cutoffIso: "2026-02-14T10:00:00.000Z",
      deletedCount: 7,
    })
  })

  it("reads retention from env when retentionDays is not provided", async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = "14"
    const now = new Date("2026-02-24T00:00:00.000Z")

    await purgeExpiredAuditLogs({ now })

    expect(mockDeleteOlderThan).toHaveBeenCalledTimes(1)
    const cutoffArg = mockDeleteOlderThan.mock.calls[0]?.[0]
    expect(cutoffArg?.toISOString()).toBe("2026-02-10T00:00:00.000Z")
  })

  it("anonymizes user audit logs with trimmed userId", async () => {
    mockAnonymizeByUserId.mockResolvedValue(5)

    const updated = await anonymizeAuditLogsForUser(" user-123 ")

    expect(updated).toBe(5)
    expect(mockAnonymizeByUserId).toHaveBeenCalledWith("user-123")
  })

  it("throws when anonymize userId is blank", async () => {
    await expect(anonymizeAuditLogsForUser("   ")).rejects.toThrow(
      "userId is required to anonymize audit logs."
    )
  })
})
