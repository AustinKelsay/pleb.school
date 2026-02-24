import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@vercel/kv", () => ({
  kv: {
    smembers: vi.fn().mockResolvedValue([]),
    getdel: vi.fn().mockResolvedValue(0),
    srem: vi.fn().mockResolvedValue(0),
    set: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock("@/lib/db-adapter", () => ({
  ViewCounterAdapter: {
    upsertTotal: vi.fn().mockResolvedValue(undefined),
    upsertDaily: vi.fn().mockResolvedValue(undefined),
  },
}))

import { GET } from "../flush/route"
import { kv } from "@vercel/kv"

const originalSecret = process.env.VIEWS_CRON_SECRET
const originalNodeEnv = process.env.NODE_ENV
const mutableEnv = process.env as Record<string, string | undefined>

function createRequest({
  authorization,
  token,
  cronHeader,
  status,
}: {
  authorization?: string
  token?: string
  cronHeader?: string
  status?: string
}): NextRequest {
  const url = new URL("https://pleb.school/api/views/flush")
  if (token) {
    url.searchParams.set("token", token)
  }
  if (status) {
    url.searchParams.set("status", status)
  }

  const headers = new Headers()
  if (authorization) {
    headers.set("authorization", authorization)
  }
  if (cronHeader) {
    headers.set("x-vercel-cron", cronHeader)
  }

  return new NextRequest(url.toString(), {
    method: "GET",
    headers,
  })
}

describe("views flush authorization", () => {
  const mockKvSmembers = vi.mocked(kv.smembers)
  const mockKvSet = vi.mocked(kv.set)
  const mockKvIncr = vi.mocked(kv.incr)
  const mockKvGet = vi.mocked(kv.get)

  beforeEach(() => {
    process.env.VIEWS_CRON_SECRET = "super-secret"
    mutableEnv.NODE_ENV = "test"
    mockKvSmembers.mockResolvedValue([])
    mockKvSet.mockResolvedValue("OK" as never)
    mockKvIncr.mockResolvedValue(1 as never)
    mockKvGet.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (originalSecret === undefined) {
      delete process.env.VIEWS_CRON_SECRET
    } else {
      process.env.VIEWS_CRON_SECRET = originalSecret
    }
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv
    }
  })

  it("rejects x-vercel-cron header without a matching secret token", async () => {
    const response = await GET(
      createRequest({ cronHeader: "1" })
    )

    expect(response.status).toBe(401)
  })

  it("accepts bearer token auth when the secret matches", async () => {
    const response = await GET(
      createRequest({ authorization: "Bearer super-secret" })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ flushedTotals: 0, flushedDaily: 0 })
    expect(mockKvSet).toHaveBeenCalledWith("views:flush:meta:last_success_at", expect.any(String))
    expect(mockKvSet).toHaveBeenCalledWith("views:flush:meta:consecutive_failures", 0)
  })

  it("rejects bearer token auth when the secret mismatches", async () => {
    const response = await GET(
      createRequest({ authorization: "Bearer wrong-secret" })
    )

    expect(response.status).toBe(401)
  })

  it("allows query token only outside production for local/manual testing", async () => {
    mutableEnv.NODE_ENV = "development"

    const response = await GET(
      createRequest({ token: "super-secret" })
    )

    expect(response.status).toBe(200)
  })

  it("fails closed when VIEWS_CRON_SECRET is missing in production", async () => {
    mutableEnv.NODE_ENV = "production"
    delete process.env.VIEWS_CRON_SECRET

    const response = await GET(
      createRequest({ authorization: "Bearer anything" })
    )

    expect(response.status).toBe(401)
  })

  it("returns flush status payload when status mode is requested", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    mockKvGet.mockImplementation(async (key) => {
      if (key === "views:flush:meta:last_success_at") return tenMinutesAgo
      if (key === "views:flush:meta:last_attempt_at") return tenMinutesAgo
      if (key === "views:flush:meta:consecutive_failures") return 2
      if (key === "views:flush:meta:last_duration_ms") return 120
      if (key === "views:flush:meta:last_flushed_totals") return 6
      if (key === "views:flush:meta:last_flushed_daily") return 5
      return null
    })

    const response = await GET(
      createRequest({ authorization: "Bearer super-secret", status: "1" })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lastSuccessAt).toBe(tenMinutesAgo)
    expect(payload.lastAttemptAt).toBe(tenMinutesAgo)
    expect(payload.consecutiveFailures).toBe(2)
    expect(payload.lastDurationMs).toBe(120)
    expect(payload.lastFlushedTotals).toBe(6)
    expect(payload.lastFlushedDaily).toBe(5)
    expect(payload.isStale).toBe(false)
  })

  it("records failure telemetry when flush execution throws", async () => {
    mockKvSmembers.mockRejectedValueOnce(new Error("kv unavailable"))

    const response = await GET(
      createRequest({ authorization: "Bearer super-secret" })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: "Failed to flush view counters" })
    expect(mockKvIncr).toHaveBeenCalledWith("views:flush:meta:consecutive_failures")
  })
})
