import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/audit-log-maintenance", () => ({
  purgeExpiredAuditLogs: vi.fn(),
  anonymizeAuditLogsForUser: vi.fn(),
  resolveAuditLogRetentionDays: vi.fn(),
}))

import {
  anonymizeAuditLogsForUser,
  purgeExpiredAuditLogs,
  resolveAuditLogRetentionDays,
} from "@/lib/audit-log-maintenance"
import { GET, POST } from "../maintenance/route"

const mockPurgeExpiredAuditLogs = vi.mocked(purgeExpiredAuditLogs)
const mockAnonymizeAuditLogsForUser = vi.mocked(anonymizeAuditLogsForUser)
const mockResolveAuditLogRetentionDays = vi.mocked(resolveAuditLogRetentionDays)

const originalAuditCronSecret = process.env.AUDIT_LOG_CRON_SECRET
const originalCronSecret = process.env.CRON_SECRET
const originalNodeEnv = process.env.NODE_ENV

const mutableEnv = process.env as Record<string, string | undefined>

function createRequest({
  method,
  authorization,
  token,
  jsonBody,
  rawBody,
}: {
  method: "GET" | "POST"
  authorization?: string
  token?: string
  jsonBody?: unknown
  rawBody?: string
}): NextRequest {
  const url = new URL("https://pleb.school/api/audit/maintenance")
  if (token) {
    url.searchParams.set("token", token)
  }

  const headers = new Headers()
  if (authorization) {
    headers.set("authorization", authorization)
  }

  let body: BodyInit | undefined
  if (jsonBody !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(jsonBody)
  } else if (rawBody !== undefined) {
    headers.set("content-type", "application/json")
    body = rawBody
  }

  return new NextRequest(url.toString(), {
    method,
    headers,
    body,
  })
}

describe("audit maintenance authorization", () => {
  beforeEach(() => {
    mutableEnv.NODE_ENV = "test"
    mutableEnv.AUDIT_LOG_CRON_SECRET = "audit-secret"
    delete mutableEnv.CRON_SECRET

    mockPurgeExpiredAuditLogs.mockResolvedValue({
      retentionDays: 90,
      cutoff: new Date("2026-01-01T00:00:00.000Z"),
      cutoffIso: "2026-01-01T00:00:00.000Z",
      deletedCount: 3,
    })
    mockAnonymizeAuditLogsForUser.mockResolvedValue(0)
    mockResolveAuditLogRetentionDays.mockReturnValue(90)
  })

  afterEach(() => {
    vi.clearAllMocks()

    if (originalAuditCronSecret === undefined) {
      delete mutableEnv.AUDIT_LOG_CRON_SECRET
    } else {
      mutableEnv.AUDIT_LOG_CRON_SECRET = originalAuditCronSecret
    }

    if (originalCronSecret === undefined) {
      delete mutableEnv.CRON_SECRET
    } else {
      mutableEnv.CRON_SECRET = originalCronSecret
    }

    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv
    }
  })

  it("rejects unauthorized requests", async () => {
    const response = await GET(createRequest({ method: "GET" }))

    expect(response.status).toBe(401)
    expect(mockPurgeExpiredAuditLogs).not.toHaveBeenCalled()
  })

  it("accepts bearer auth with AUDIT_LOG_CRON_SECRET", async () => {
    const response = await GET(
      createRequest({
        method: "GET",
        authorization: "Bearer audit-secret",
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      deletedCount: 3,
      cutoff: "2026-01-01T00:00:00.000Z",
      retentionDays: 90,
      anonymizedCount: 0,
    })
  })

  it("falls back to CRON_SECRET when AUDIT_LOG_CRON_SECRET is not set", async () => {
    delete mutableEnv.AUDIT_LOG_CRON_SECRET
    mutableEnv.CRON_SECRET = "fallback-secret"

    const response = await GET(
      createRequest({
        method: "GET",
        authorization: "Bearer fallback-secret",
      })
    )

    expect(response.status).toBe(200)
  })

  it("allows query token outside production", async () => {
    mutableEnv.NODE_ENV = "development"

    const response = await GET(
      createRequest({
        method: "GET",
        token: "audit-secret",
      })
    )

    expect(response.status).toBe(200)
  })

  it("rejects query token in production", async () => {
    mutableEnv.NODE_ENV = "production"

    const response = await GET(
      createRequest({
        method: "GET",
        token: "audit-secret",
      })
    )

    expect(response.status).toBe(401)
  })

  it("returns 400 on invalid JSON for POST", async () => {
    const response = await POST(
      createRequest({
        method: "POST",
        authorization: "Bearer audit-secret",
        rawBody: "{not-valid-json",
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: "Invalid JSON body" })
  })

  it("returns 400 on invalid POST payload", async () => {
    const response = await POST(
      createRequest({
        method: "POST",
        authorization: "Bearer audit-secret",
        jsonBody: { retentionDays: 0 },
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Invalid request body")
  })

  it("runs purge and anonymize via POST", async () => {
    mockAnonymizeAuditLogsForUser.mockResolvedValue(2)

    const response = await POST(
      createRequest({
        method: "POST",
        authorization: "Bearer audit-secret",
        jsonBody: { retentionDays: 30, anonymizeUserId: "user-42" },
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockPurgeExpiredAuditLogs).toHaveBeenCalledWith({ retentionDays: 30 })
    expect(mockAnonymizeAuditLogsForUser).toHaveBeenCalledWith("user-42")
    expect(mockResolveAuditLogRetentionDays).not.toHaveBeenCalled()
    expect(payload).toEqual({
      deletedCount: 3,
      cutoff: "2026-01-01T00:00:00.000Z",
      retentionDays: 90,
      anonymizedCount: 2,
    })
  })

  it("returns 500 when maintenance throws", async () => {
    mockPurgeExpiredAuditLogs.mockRejectedValueOnce(new Error("db failed"))

    const response = await GET(
      createRequest({
        method: "GET",
        authorization: "Bearer audit-secret",
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: "Failed to run audit maintenance" })
  })
})
