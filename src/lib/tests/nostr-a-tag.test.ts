import { describe, expect, it } from "vitest"

import { getEventATag } from "@/lib/nostr-a-tag"

describe("getEventATag", () => {
  it("builds an a-tag for addressable events", () => {
    const event = {
      kind: 30023,
      pubkey: "ABCDEF0123",
      tags: [["d", "resource-123"]],
    } as any

    expect(getEventATag(event)).toBe("30023:abcdef0123:resource-123")
  })

  it("returns undefined for non-addressable events", () => {
    const event = {
      kind: 1,
      pubkey: "abcdef",
      tags: [["d", "ignored"]],
    } as any

    expect(getEventATag(event)).toBeUndefined()
  })

  it("returns undefined when d-tag or pubkey is missing", () => {
    expect(
      getEventATag({
        kind: 30023,
        pubkey: "",
        tags: [["d", "x"]],
      } as any)
    ).toBeUndefined()

    expect(
      getEventATag({
        kind: 30023,
        pubkey: "abcdef",
        tags: [["t", "bitcoin"]],
      } as any)
    ).toBeUndefined()
  })
})
