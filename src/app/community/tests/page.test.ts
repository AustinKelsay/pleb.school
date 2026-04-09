import { beforeEach, describe, expect, it, vi } from "vitest"

const mockIsFeedsEnabled = vi.fn()
const mockNotFound = vi.fn()
const mockRedirect = vi.fn()

vi.mock("@/lib/feeds-config", () => ({
  isFeedsEnabled: (...args: unknown[]) => mockIsFeedsEnabled(...args),
}))

vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => mockNotFound(...args),
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe("/community page gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound when feeds are disabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(false)
    mockNotFound.mockImplementation(() => {
      throw new Error("notFound")
    })

    const { default: CommunityPage } = await import("../page")
    expect(() => CommunityPage()).toThrow("notFound")

    expect(mockNotFound).toHaveBeenCalledOnce()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects to /feeds when feeds are enabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(true)
    mockRedirect.mockImplementation(() => {
      throw new Error("redirect")
    })

    const { default: CommunityPage } = await import("../page")
    expect(() => CommunityPage()).toThrow("redirect")

    expect(mockRedirect).toHaveBeenCalledWith("/feeds")
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
