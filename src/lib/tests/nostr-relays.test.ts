import { afterEach, describe, expect, it, vi } from "vitest"

import nostrConfig from "../../../config/nostr.json"
import { DEFAULT_RELAYS, RELAY_ALLOWLIST, getRelays } from "../nostr-relays"

const CANONICAL_RELAYS = nostrConfig.relays.default

describe("nostr relay configuration", () => {
  it("uses config default relays as the canonical runtime relay set", () => {
    expect(DEFAULT_RELAYS).toEqual(CANONICAL_RELAYS)
    expect(getRelays("default")).toEqual(CANONICAL_RELAYS)
  })

  it("falls back to the canonical default relays for omitted scoped sets", () => {
    expect(getRelays("content")).toEqual(CANONICAL_RELAYS)
    expect(getRelays("profile")).toEqual(CANONICAL_RELAYS)
    expect(getRelays("zapThreads")).toEqual(CANONICAL_RELAYS)
  })

  it("builds a deduplicated relay allowlist from the configured relay sets", () => {
    expect(RELAY_ALLOWLIST).toEqual(expect.arrayContaining(CANONICAL_RELAYS))
    expect(new Set(RELAY_ALLOWLIST).size).toBe(RELAY_ALLOWLIST.length)
  })

  it("ignores non-string relay entries in malformed config arrays", async () => {
    vi.resetModules()
    vi.doMock("../../../config/nostr.json", () => ({
      default: {
        relays: {
          default: ["wss://nos.lol", 42, null, "  wss://relay.damus.io  ", ""],
          custom: [false, "wss://nostr.land"],
        },
      },
    }))

    const relaysModule = await import("../nostr-relays")

    expect(relaysModule.DEFAULT_RELAYS).toEqual(["wss://nos.lol", "wss://relay.damus.io"])
    expect(relaysModule.RELAY_ALLOWLIST).toEqual([
      "wss://nos.lol",
      "wss://relay.damus.io",
      "wss://nostr.land",
    ])
  })
})

afterEach(() => {
  vi.doUnmock("../../../config/nostr.json")
})
