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

function setupVercelAnalyticsEnv() {
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "true"
  process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER = "vercel"
  ;(globalThis as { window?: Window }).window = {} as Window
}

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
    setupVercelAnalyticsEnv()

    const { trackEvent } = await import("../analytics")
    const analyticsModule = await import("@vercel/analytics")

    await trackEvent("first_event", { count: 1, ignored: undefined })
    await trackEvent("second_event")

    expect(analyticsModule.inject).toHaveBeenCalledTimes(1)
    expect(analyticsModule.inject).toHaveBeenCalledWith({
      basePath: undefined,
      framework: "next",
    })
    expect(analyticsModule.track).toHaveBeenCalledTimes(2)
    expect(analyticsModule.track).toHaveBeenNthCalledWith(1, "first_event", { count: 1 })
    expect(analyticsModule.track).toHaveBeenNthCalledWith(2, "second_event", undefined)
  })

  it("reuses a shared initialization when multiple events track concurrently", async () => {
    setupVercelAnalyticsEnv()

    const { trackEvent } = await import("../analytics")
    const analyticsModule = await import("@vercel/analytics")

    await Promise.all([
      trackEvent("concurrent_one"),
      trackEvent("concurrent_two"),
      trackEvent("concurrent_three"),
    ])

    expect(analyticsModule.inject).toHaveBeenCalledTimes(1)
    expect(analyticsModule.track).toHaveBeenCalledTimes(3)
  })

  it("does not re-inject while runtime readiness is still pending", async () => {
    vi.useFakeTimers()
    try {
      setupVercelAnalyticsEnv()

      const { trackEvent } = await import("../analytics")
      const analyticsModule = await import("@vercel/analytics")
      const injectMock = vi.mocked(analyticsModule.inject)
      const trackMock = vi.mocked(analyticsModule.track)

      injectMock.mockImplementation(() => {
        const scopedWindow = (globalThis as { window?: Window & { va?: () => void } }).window
        if (scopedWindow) {
          scopedWindow.va = vi.fn()
        }
      })

      const first = trackEvent("pending_one")
      await vi.advanceTimersByTimeAsync(10)
      const second = trackEvent("pending_two")
      await vi.advanceTimersByTimeAsync(1)
      await Promise.all([first, second])

      expect(injectMock).toHaveBeenCalledTimes(1)
      expect(trackMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("reuses an existing mounted analytics runtime without re-injecting", async () => {
    setupVercelAnalyticsEnv()
    ;(globalThis as { window?: Window & { va?: () => void } }).window = {
      va: vi.fn(),
    } as unknown as Window & { va?: () => void }

    const { trackEvent } = await import("../analytics")
    const analyticsModule = await import("@vercel/analytics")

    await trackEvent("existing_runtime")

    expect(analyticsModule.inject).not.toHaveBeenCalled()
    expect(analyticsModule.track).toHaveBeenCalledWith("existing_runtime", undefined)
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
