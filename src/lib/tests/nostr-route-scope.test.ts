import { describe, expect, it } from "vitest"

import { shouldEnableSnstrForPathname } from "@/lib/nostr-route-scope"

describe("shouldEnableSnstrForPathname", () => {
  it("disables Snstr on explicitly non-Nostr pages", () => {
    expect(shouldEnableSnstrForPathname("/about")).toBe(false)
    expect(shouldEnableSnstrForPathname("/about/")).toBe(false)
    expect(shouldEnableSnstrForPathname("/feeds")).toBe(false)
    expect(shouldEnableSnstrForPathname("/subscribe")).toBe(false)
    expect(shouldEnableSnstrForPathname("/verify-email")).toBe(false)
  })

  it("disables Snstr across auth routes", () => {
    expect(shouldEnableSnstrForPathname("/auth")).toBe(false)
    expect(shouldEnableSnstrForPathname("/auth/signin")).toBe(false)
    expect(shouldEnableSnstrForPathname("/auth/error")).toBe(false)
    expect(shouldEnableSnstrForPathname("/auth/verify-request")).toBe(false)
    expect(shouldEnableSnstrForPathname("/authentic")).toBe(true)
  })

  it("disables Snstr for server-rendered homepage and library routes", () => {
    expect(shouldEnableSnstrForPathname("/")).toBe(false)
    expect(shouldEnableSnstrForPathname("/content")).toBe(false)
    expect(shouldEnableSnstrForPathname("/content/")).toBe(false)
  })

  it("keeps Snstr enabled for remaining content-facing routes", () => {
    expect(shouldEnableSnstrForPathname("/courses/123")).toBe(true)
    expect(shouldEnableSnstrForPathname("/profile")).toBe(true)
  })

  it("defaults to enabled when pathname is not yet available", () => {
    expect(shouldEnableSnstrForPathname(null)).toBe(true)
  })
})
