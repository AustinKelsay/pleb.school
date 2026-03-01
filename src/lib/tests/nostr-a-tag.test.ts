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

  it("accepts the addressable lower boundary kind (30000)", () => {
    const event = {
      kind: 30000,
      pubkey: "ABCDEF",
      tags: [["d", "course-1"]],
    } as any

    expect(getEventATag(event)).toBe("30000:abcdef:course-1")
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

  it("returns undefined for whitespace-only d-tag values", () => {
    expect(
      getEventATag({
        kind: 30023,
        pubkey: "abcdef",
        tags: [["d", "   "]],
      } as any)
    ).toBeUndefined()
  })

  it("returns undefined for nullish events", () => {
    expect(getEventATag(null)).toBeUndefined()
    expect(getEventATag(undefined)).toBeUndefined()
  })
})
