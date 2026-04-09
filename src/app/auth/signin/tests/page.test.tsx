import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetServerSession = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

vi.mock("@/lib/auth", () => ({
  authOptions: { providers: [] },
}))

vi.mock("@/app/auth/signin/signin-page-client", () => ({
  default: () => createElement("div", null, "Sign in UI"),
}))

describe("/auth/signin page gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("redirects authenticated users to the sanitized callback target", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1" },
    })
    mockRedirect.mockImplementation(() => {
      throw new Error("redirect")
    })

    const { default: SignInPage } = await import("../page")

    await expect(
      SignInPage({
        searchParams: Promise.resolve({
          callbackUrl: "/profile",
        }),
      })
    ).rejects.toThrow("redirect")

    expect(mockRedirect).toHaveBeenCalledWith("/profile")
  })

  it("redirects authenticated users away from auth routes to avoid loops", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1" },
    })
    mockRedirect.mockImplementation(() => {
      throw new Error("redirect")
    })

    const { default: SignInPage } = await import("../page")

    await expect(
      SignInPage({
        searchParams: Promise.resolve({
          callbackUrl: "/auth/signin",
        }),
      })
    ).rejects.toThrow("redirect")

    expect(mockRedirect).toHaveBeenCalledWith("/")
  })

  it("renders the sign-in client UI for unauthenticated visitors", async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { default: SignInPage } = await import("../page")
    const page = await SignInPage({
      searchParams: Promise.resolve({}),
    })

    expect(renderToStaticMarkup(page)).toContain("Sign in UI")
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
