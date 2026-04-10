import { describe, expect, it } from "vitest"

import {
  formatPubkeyWithEllipsis,
  profileSummaryFromUser,
  resolvePreferredDisplayName,
} from "@/lib/profile-display"

const LONG_PUBKEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

describe("formatPubkeyWithEllipsis", () => {
  it("trims and truncates long pubkeys", () => {
    expect(formatPubkeyWithEllipsis(`  ${LONG_PUBKEY}  `)).toBe("0123456789ab...abcdef")
  })

  it("returns an empty string for missing pubkeys", () => {
    expect(formatPubkeyWithEllipsis(undefined)).toBe("")
    expect(formatPubkeyWithEllipsis("   ")).toBe("")
  })
})

describe("profileSummaryFromUser", () => {
  it("returns null when no summary fields exist", () => {
    expect(profileSummaryFromUser(undefined)).toBeNull()
    expect(profileSummaryFromUser({})).toBeNull()
  })

  it("builds a normalized profile when any field exists", () => {
    expect(
      profileSummaryFromUser({
        displayName: "  Satoshi  ",
        username: "satoshi",
        pubkey: LONG_PUBKEY,
        avatar: "https://example.com/avatar.png",
        nip05: "satoshi@example.com",
        lud16: "satoshi@getalby.com",
      })
    ).toEqual({
      name: "  Satoshi  ",
      display_name: "  Satoshi  ",
      picture: "https://example.com/avatar.png",
      nip05: "satoshi@example.com",
      lud16: "satoshi@getalby.com",
      pubkey: LONG_PUBKEY,
    })
  })
})

describe("resolvePreferredDisplayName", () => {
  it("prefers profile.name over all other values", () => {
    expect(
      resolvePreferredDisplayName({
        profile: { name: "Alice", display_name: "Display Alice" },
        preferredNames: ["Preferred Alice"],
        user: { displayName: "User Alice", username: "alice" },
        pubkey: LONG_PUBKEY,
        fallback: "Fallback Alice",
      })
    ).toBe("Alice")
  })

  it("falls back through display_name, preferred names, user display name, and username", () => {
    expect(
      resolvePreferredDisplayName({
        profile: { display_name: "Display Name" },
        preferredNames: ["Preferred Name"],
        user: { displayName: "User Name", username: "username" },
      })
    ).toBe("Display Name")

    expect(
      resolvePreferredDisplayName({
        preferredNames: ["  Preferred Name  ", "Ignored"],
        user: { displayName: "User Name", username: "username" },
      })
    ).toBe("Preferred Name")

    expect(
      resolvePreferredDisplayName({
        preferredNames: ["   "],
        user: { displayName: "  User Display  ", username: "username" },
      })
    ).toBe("User Display")

    expect(
      resolvePreferredDisplayName({
        preferredNames: ["   "],
        user: { displayName: "   ", username: "  username  " },
      })
    ).toBe("username")
  })

  it("ignores blank strings and uses the fallback when no name is available", () => {
    expect(
      resolvePreferredDisplayName({
        preferredNames: ["   ", ""],
        user: { displayName: "   ", username: "" },
        fallback: "  Fallback Name  ",
      })
    ).toBe("Fallback Name")
  })

  it("uses a truncated pubkey when no name-based values exist", () => {
    expect(
      resolvePreferredDisplayName({
        preferredNames: ["   "],
        user: { displayName: "", username: "", pubkey: LONG_PUBKEY },
      })
    ).toBe("0123456789ab...abcdef")

    expect(
      resolvePreferredDisplayName({
        pubkey: LONG_PUBKEY,
      })
    ).toBe("0123456789ab...abcdef")
  })
})
