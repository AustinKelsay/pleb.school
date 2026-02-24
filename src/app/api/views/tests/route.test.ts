import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type LoadedRoute = {
  GET: (request: any) => Promise<Response>
  POST: (request: any) => Promise<Response>
  checkRateLimit: ReturnType<typeof vi.fn>
}

const originalKvUrl = process.env.KV_REST_API_URL
const originalKvToken = process.env.KV_REST_API_TOKEN

async function loadRouteWithRateLimitSuccess(success: boolean): Promise<LoadedRoute> {
  vi.resetModules()

  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN

  const mockCheckRateLimit = vi.fn().mockResolvedValue({
    success,
    remaining: success ? 10 : 0,
    resetIn: 30,
  })

  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: mockCheckRateLimit,
  }))

  vi.doMock("@vercel/kv", () => ({
    kv: {
      get: vi.fn(),
      incr: vi.fn(),
      sadd: vi.fn(),
    },
  }))

  const routeModule = await import("../route")

  return {
    GET: routeModule.GET,
    POST: routeModule.POST,
    checkRateLimit: mockCheckRateLimit,
  }
}

describe("/api/views route", () => {
  beforeEach(() => {
    delete (globalThis as any).__viewCounterMemory
    delete (globalThis as any).__dirtyKeys
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    if (originalKvUrl === undefined) {
      delete process.env.KV_REST_API_URL
    } else {
      process.env.KV_REST_API_URL = originalKvUrl
    }
    if (originalKvToken === undefined) {
      delete process.env.KV_REST_API_TOKEN
    } else {
      process.env.KV_REST_API_TOKEN = originalKvToken
    }
  })

  it("returns 400 when neither key nor ns/id is provided", async () => {
    const { POST } = await loadRouteWithRateLimitSuccess(true)
    const request = new Request("https://pleb.school/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it("returns 400 for invalid key format", async () => {
    const { POST } = await loadRouteWithRateLimitSuccess(true)
    const request = new Request("https://pleb.school/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "arbitrary-user-input" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain("Invalid")
  })

  it("returns 429 when write rate limit is exceeded", async () => {
    const { POST } = await loadRouteWithRateLimitSuccess(false)
    const request = new Request("https://pleb.school/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "views:content:abc123" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("30")
  })

  it("increments a valid views key when request passes validation and rate limit", async () => {
    const { POST } = await loadRouteWithRateLimitSuccess(true)
    const request = new Request("https://pleb.school/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "views:content:abc123" }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.key).toBe("views:content:abc123")
    expect(payload.count).toBe(1)
  })

  it("reads a key by ns/id on GET with rate limiting enforced", async () => {
    const { GET, POST, checkRateLimit } = await loadRouteWithRateLimitSuccess(true)

    const postRequest = new Request("https://pleb.school/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ns: "content", id: "abc123" }),
    })
    await POST(postRequest)

    const getRequest = new Request("https://pleb.school/api/views?ns=content&id=abc123", {
      method: "GET",
    })
    const getResponse = await GET(getRequest)
    const payload = await getResponse.json()

    expect(getResponse.status).toBe(200)
    expect(payload).toEqual({ key: "views:content:abc123", count: 1 })
    expect(checkRateLimit).toHaveBeenCalled()
  })
})
