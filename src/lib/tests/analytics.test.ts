import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@vercel/analytics", () => ({
  inject: vi.fn(() => {
    const scopedWindow = (globalThis as { window?: Window & { va?: () => void } }).window
    if (scopedWindow) {
      scopedWindow.va = vi.fn()
    }
  }),
  track: vi.fn(),
}))

const ORIGINAL_ENV = { ...process.env }

describe("analytics runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.NEXT_PUBLIC_ANALYTICS_ENABLED
    delete process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete (globalThis as { window?: Window }).window
  })

  it("injects analytics once before tracking events", async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "true"
    process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER = "vercel"
    ;(globalThis as { window?: Window }).window = {} as Window

    const { trackEvent } = await import("../analytics")
    const analyticsModule = await import("@vercel/analytics")

    await trackEvent("first_event", { count: 1, ignored: undefined })
    await trackEvent("second_event")

    expect(analyticsModule.inject).toHaveBeenCalledTimes(1)
    expect(analyticsModule.inject).toHaveBeenCalledWith({ framework: "react" })
    expect(analyticsModule.track).toHaveBeenCalledTimes(2)
    expect(analyticsModule.track).toHaveBeenNthCalledWith(1, "first_event", { count: 1 })
    expect(analyticsModule.track).toHaveBeenNthCalledWith(2, "second_event", undefined)
  })

  it("does nothing when analytics is disabled", async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "false"
    ;(globalThis as { window?: Window }).window = {} as Window

    const { trackEvent } = await import("../analytics")
    const analyticsModule = await import("@vercel/analytics")

    await trackEvent("disabled_event")

    expect(analyticsModule.inject).not.toHaveBeenCalled()
    expect(analyticsModule.track).not.toHaveBeenCalled()
  })
})
