import { describe, expect, it } from "vitest"
import { getFeedsConfig, isFeedsEnabled, parseFeedsConfig } from "@/lib/feeds-config"

describe("feeds config", () => {
  it("parses the checked-in feeds config", () => {
    expect(getFeedsConfig().enabled).toBe(true)
    expect(isFeedsEnabled()).toBe(true)
  })

  it("defaults feeds to enabled when the key is missing", () => {
    expect(parseFeedsConfig({}).enabled).toBe(true)
  })

  it("respects feeds.enabled=false", () => {
    expect(parseFeedsConfig({
      feeds: {
        enabled: false,
      },
    }).enabled).toBe(false)
  })
})
