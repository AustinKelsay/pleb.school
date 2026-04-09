import { describe, expect, it } from "vitest"

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
})
