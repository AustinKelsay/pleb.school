import { beforeEach, describe, expect, it, vi } from "vitest"

const mockIsFeedsEnabled = vi.fn()
const mockNotFound = vi.fn()

vi.mock("@/lib/feeds-config", () => ({
  isFeedsEnabled: (...args: unknown[]) => mockIsFeedsEnabled(...args),
}))

vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => mockNotFound(...args),
}))

describe("/feeds page gating", () => {
  beforeEach(() => {
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
})
