import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@vercel/kv", () => ({
  kv: {
    smembers: vi.fn().mockResolvedValue([]),
    getdel: vi.fn().mockResolvedValue(0),
    srem: vi.fn().mockResolvedValue(0),
  },
}))

vi.mock("@/lib/db-adapter", () => ({
  ViewCounterAdapter: {
    upsertTotal: vi.fn().mockResolvedValue(undefined),
    upsertDaily: vi.fn().mockResolvedValue(undefined),
  },
}))

import { GET } from "../flush/route"

const originalSecret = process.env.VIEWS_CRON_SECRET
const originalNodeEnv = process.env.NODE_ENV
const mutableEnv = process.env as Record<string, string | undefined>

function createRequest({
  authorization,
  token,
  cronHeader,
}: {
  authorization?: string
  token?: string
  cronHeader?: string
}): NextRequest {
  const url = new URL("https://pleb.school/api/views/flush")
  if (token) {
    url.searchParams.set("token", token)
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
  beforeEach(() => {
    process.env.VIEWS_CRON_SECRET = "super-secret"
    mutableEnv.NODE_ENV = "test"
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
})
