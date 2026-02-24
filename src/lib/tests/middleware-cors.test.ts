import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { config as middlewareConfig, middleware } from "../../../middleware"

type RequestOptions = {
  method: string
  path: string
  origin?: string
  requestMethod?: string
  requestHeaders?: string
}

function createRequest(options: RequestOptions): NextRequest {
  const headers = new Headers()
  if (options.origin) {
    headers.set("origin", options.origin)
  }
  if (options.requestMethod) {
    headers.set("access-control-request-method", options.requestMethod)
  }
  if (options.requestHeaders) {
    headers.set("access-control-request-headers", options.requestHeaders)
  }

  return new NextRequest(`https://pleb.school${options.path}`, {
    method: options.method,
    headers,
  })
}

const originalAllowedOrigins = process.env.ALLOWED_ORIGINS
const originalNodeEnv = process.env.NODE_ENV
const originalRemoteFontsFlag = process.env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS
const mutableEnv = process.env as Record<string, string | undefined>
const AUTH_EXCLUSION_MATCHER = "/((?!api/auth|_next/static|_next/image|favicon.ico|public/).*)"

beforeAll(() => {
  mutableEnv.NODE_ENV = "test"
})

afterAll(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.ALLOWED_ORIGINS
  } else {
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins
  }
  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv
  }
  if (originalRemoteFontsFlag === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS
  } else {
    process.env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS = originalRemoteFontsFlag
  }
})

describe("middleware CORS preflight handling", () => {
  it("returns CORS + security headers on allowed preflight requests", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com,https://admin.example.com"

    const request = createRequest({
      method: "OPTIONS",
      path: "/api/views",
      origin: "https://app.example.com",
      requestMethod: "POST",
      requestHeaders: "authorization,content-type",
    })

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS")
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("authorization,content-type")
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400")
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")

    const vary = response.headers.get("Vary") ?? ""
    expect(vary).toContain("Origin")
    expect(vary).toContain("Access-Control-Request-Method")
    expect(vary).toContain("Access-Control-Request-Headers")
  })

  it("omits allow-origin for disallowed preflight origins", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com"

    const request = createRequest({
      method: "OPTIONS",
      path: "/api/views",
      origin: "https://evil.example.com",
      requestMethod: "POST",
      requestHeaders: "content-type",
    })

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS")
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("content-type")
  })

  it("keeps regular API responses CORS-enabled for allowed origins", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com"

    const request = createRequest({
      method: "GET",
      path: "/api/views",
      origin: "https://app.example.com",
    })

    const response = middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS")
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization")
  })

  it("falls back to default allow headers when request headers are omitted", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com"

    const request = createRequest({
      method: "OPTIONS",
      path: "/api/views",
      origin: "https://app.example.com",
      requestMethod: "POST",
    })

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization")
  })

  it("parses ALLOWED_ORIGINS with whitespace and empty entries safely", () => {
    process.env.ALLOWED_ORIGINS = "  https://app.example.com  , , https://admin.example.com , "

    const request = createRequest({
      method: "GET",
      path: "/api/views",
      origin: "https://admin.example.com",
    })

    const response = middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://admin.example.com")
  })

  it("uses localhost defaults when ALLOWED_ORIGINS is unset", () => {
    delete process.env.ALLOWED_ORIGINS

    const request = createRequest({
      method: "OPTIONS",
      path: "/api/views",
      origin: "http://localhost:3000",
      requestMethod: "POST",
    })

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000")
  })

  it("does not attach API CORS headers to non-API routes", () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com"

    const request = createRequest({
      method: "OPTIONS",
      path: "/profile",
      origin: "https://app.example.com",
      requestMethod: "POST",
      requestHeaders: "content-type",
    })

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Headers")).toBeNull()
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'")
  })

  it("documents matcher exclusion for /api/auth routes", () => {
    const matchers = Array.isArray(middlewareConfig.matcher) ? middlewareConfig.matcher : []
    expect(matchers.length).toBeGreaterThan(0)
    expect(matchers).toContain(AUTH_EXCLUSION_MATCHER)
  })

  it("includes fonts.googleapis.com in CSP style-src when remote fonts are enabled", () => {
    process.env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS = "true"

    const request = createRequest({
      method: "GET",
      path: "/profile",
    })

    const response = middleware(request)
    const csp = response.headers.get("Content-Security-Policy") ?? ""

    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
  })

  it("excludes fonts.googleapis.com in CSP style-src when remote fonts are disabled", () => {
    process.env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS = "false"

    const request = createRequest({
      method: "GET",
      path: "/profile",
    })

    const response = middleware(request)
    const csp = response.headers.get("Content-Security-Policy") ?? ""

    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("https://fonts.googleapis.com")
  })
})
