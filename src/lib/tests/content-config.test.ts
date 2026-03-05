import { afterEach, describe, expect, it } from "vitest"

import { getContentConfig, getPlaybackConfig } from "@/lib/content-config"

const config = getContentConfig() as { playback?: { defaultSkipSeconds?: unknown } }
const originalPlayback = config.playback

afterEach(() => {
  config.playback = originalPlayback
})

describe("getPlaybackConfig", () => {
  it("falls back to 10 when playback config is missing", () => {
    config.playback = undefined
    expect(getPlaybackConfig()).toEqual({ defaultSkipSeconds: 10 })
  })

  it("falls back to 10 when defaultSkipSeconds is undefined", () => {
    config.playback = {}
    expect(getPlaybackConfig()).toEqual({ defaultSkipSeconds: 10 })
  })

  it("falls back to 10 when defaultSkipSeconds is invalid", () => {
    config.playback = { defaultSkipSeconds: "not-a-number" }
    expect(getPlaybackConfig()).toEqual({ defaultSkipSeconds: 10 })
  })

  it("returns normalized supported values for valid inputs", () => {
    config.playback = { defaultSkipSeconds: 15 }
    expect(getPlaybackConfig()).toEqual({ defaultSkipSeconds: 15 })

    config.playback = { defaultSkipSeconds: 10 }
    expect(getPlaybackConfig()).toEqual({ defaultSkipSeconds: 10 })
  })
})

