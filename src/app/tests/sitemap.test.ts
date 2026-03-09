import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFindAllCourses = vi.fn()
const mockFindAllResources = vi.fn()
const mockIsFeedsEnabled = vi.fn()

vi.mock("@/lib/db-adapter", () => ({
  CourseAdapter: {
    findAll: (...args: unknown[]) => mockFindAllCourses(...args),
  },
  ResourceAdapter: {
    findAll: (...args: unknown[]) => mockFindAllResources(...args),
  },
}))

vi.mock("@/lib/feeds-config", () => ({
  isFeedsEnabled: (...args: unknown[]) => mockIsFeedsEnabled(...args),
}))

describe("sitemap feeds gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindAllCourses.mockResolvedValue([])
    mockFindAllResources.mockResolvedValue([])
  })

  it("includes /feeds when feeds are enabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(true)

    const { default: sitemap } = await import("../sitemap")
    const entries = await sitemap()

    expect(entries.some((entry) => entry.url.endsWith("/feeds"))).toBe(true)
  })

  it("omits /feeds when feeds are disabled", async () => {
    mockIsFeedsEnabled.mockReturnValue(false)

    const { default: sitemap } = await import("../sitemap")
    const entries = await sitemap()

    expect(entries.some((entry) => entry.url.endsWith("/feeds"))).toBe(false)
  })
})
