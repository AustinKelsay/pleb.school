import { beforeEach, describe, expect, it, vi } from "vitest"

const mockIsFeedsEnabled = vi.fn()
const mockNotFound = vi.fn()

vi.mock("@/lib/feeds-config", () => ({
  isFeedsEnabled: (...args: unknown[]) => mockIsFeedsEnabled(...args),
}))

vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => mockNotFound(...args),
}))

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: unknown }) => children,
}))

vi.mock("../feeds-client", () => ({
  FeedsClient: () => "feeds-client",
}))

describe("/feeds page gating", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("calls notFound when feeds are disabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(false)
    mockNotFound.mockImplementation(() => {
      throw new Error("notFound")
    })

    const { default: FeedsPage } = await import("../page")
    expect(() => FeedsPage()).toThrow("notFound")

    expect(mockNotFound).toHaveBeenCalledOnce()
  })

  it("renders the feeds page when feeds are enabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(true)

    const { default: FeedsPage } = await import("../page")
    const page = FeedsPage()

    expect(page).toBeTruthy()
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
