import { describe, expect, it } from "vitest"
import { isRemoteFontLoadingEnabled } from "@/lib/font-loading-policy"

describe("font-loading-policy", () => {
  it("defaults to disabled in production when unset", () => {
    expect(
      isRemoteFontLoadingEnabled({
        NODE_ENV: "production",
        NEXT_PUBLIC_ENABLE_REMOTE_FONTS: undefined,
      })
    ).toBe(false)
  })

  it("defaults to enabled outside production when unset", () => {
    expect(
      isRemoteFontLoadingEnabled({
        NODE_ENV: "development",
        NEXT_PUBLIC_ENABLE_REMOTE_FONTS: undefined,
      })
    ).toBe(true)
  })

  it("supports explicit true/false override values", () => {
    expect(
      isRemoteFontLoadingEnabled({
        NODE_ENV: "production",
        NEXT_PUBLIC_ENABLE_REMOTE_FONTS: "true",
      })
    ).toBe(true)

    expect(
      isRemoteFontLoadingEnabled({
        NODE_ENV: "development",
        NEXT_PUBLIC_ENABLE_REMOTE_FONTS: "false",
      })
    ).toBe(false)
  })
})

