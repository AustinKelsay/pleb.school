/**
 * Prisma v7 JSON Field Utilities Tests
 *
 * Verifies JSON field utilities work correctly with Prisma v7 types.
 * These tests ensure the additionalLinks JSON field pattern works
 * with the new Prisma JSON types.
 */

import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma"
import {
  normalizeAdditionalLinks,
  normalizeAdditionalLink,
  additionalLinksToTags,
  tagsToAdditionalLinks,
} from "@/lib/additional-links"
import type { AdditionalLink } from "@/types/additional-links"

describe("Prisma v7 JSON Field Utilities", () => {
  describe("normalizeAdditionalLinks with Prisma types", () => {
    it("produces valid Prisma.JsonArray compatible output", () => {
      const input: AdditionalLink[] = [
        { url: "https://example.com", title: "Example" },
        { url: "https://github.com" },
      ]

      const result = normalizeAdditionalLinks(input)

      // Result should be compatible with Prisma.JsonArray
      const asJsonArray: Prisma.JsonArray = result as unknown as Prisma.JsonArray
      expect(asJsonArray).toBeDefined()
      expect(Array.isArray(asJsonArray)).toBe(true)
      expect(asJsonArray.length).toBe(2)
    })

    it("handles empty input", () => {
      const result = normalizeAdditionalLinks(undefined)
      expect(result).toEqual([])

      const nullResult = normalizeAdditionalLinks(null)
      expect(nullResult).toEqual([])
    })

    it("handles malformed JSON from database", () => {
      // Simulate raw JSON that might come from database
      const rawJson = [
        { url: "https://example.com", title: "Test" },
        { url: "invalid-url" }, // Will be normalized to https://
        "https://bare-string.com", // String entries are supported
        null, // Null entries should be filtered
        undefined, // Undefined entries should be filtered
      ]

      const result = normalizeAdditionalLinks(rawJson)

      expect(result.length).toBe(3)
      expect(result[0]).toEqual({ url: "https://example.com", title: "Test" })
      expect(result[1]).toEqual({ url: "https://invalid-url" })
      expect(result[2]).toEqual({ url: "https://bare-string.com" })
    })

    it("deduplicates by URL (case-insensitive)", () => {
      const input = [
        { url: "https://example.com", title: "First" },
        { url: "https://EXAMPLE.com", title: "Duplicate" },
        { url: "https://other.com" },
      ]

      const result = normalizeAdditionalLinks(input)

      expect(result.length).toBe(2)
      expect(result[0].title).toBe("First") // First one wins
    })
  })

  describe("normalizeAdditionalLink", () => {
    it("handles string URL input", () => {
      const result = normalizeAdditionalLink("https://example.com")
      expect(result).toEqual({ url: "https://example.com" })
    })

    it("handles object with url and title", () => {
      const result = normalizeAdditionalLink({
        url: "https://example.com",
        title: "Example Site",
      })
      expect(result).toEqual({
        url: "https://example.com",
        title: "Example Site",
      })
    })

    it("handles legacy object formats", () => {
      // Legacy 'href' property
      const hrefResult = normalizeAdditionalLink({
        href: "https://example.com",
        label: "Example",
      })
      expect(hrefResult).toEqual({
        url: "https://example.com",
        title: "Example",
      })

      // Legacy 'link' property
      const linkResult = normalizeAdditionalLink({
        link: "https://example.com",
      })
      expect(linkResult).toEqual({ url: "https://example.com" })
    })

    it("rejects dangerous URLs", () => {
      expect(normalizeAdditionalLink("javascript:alert(1)")).toBeNull()
      expect(normalizeAdditionalLink("data:text/html,<script>")).toBeNull()
    })

    it("prepends https:// to bare domains", () => {
      const result = normalizeAdditionalLink("example.com/path")
      expect(result).toEqual({ url: "https://example.com/path" })
    })

    it("preserves non-HTTP protocols", () => {
      const mailtoResult = normalizeAdditionalLink("mailto:test@example.com")
      expect(mailtoResult?.url).toBe("mailto:test@example.com")

      const nostrResult = normalizeAdditionalLink("nostr:npub123...")
      expect(nostrResult?.url).toBe("nostr:npub123...")
    })
  })

  describe("JSON type compatibility", () => {
    it("normalized links can be cast to InputJsonValue for writes", () => {
      const links: AdditionalLink[] = [
        { url: "https://example.com", title: "Test" },
      ]

      const normalized = normalizeAdditionalLinks(links)

      // This should compile without error - testing InputJsonValue compatibility
      const inputValue: Prisma.InputJsonValue = normalized as unknown as Prisma.InputJsonValue
      expect(inputValue).toBeDefined()
    })

    it("round-trips through JsonArray type", () => {
      const original: AdditionalLink[] = [
        { url: "https://example.com", title: "Example" },
        { url: "https://github.com/repo" },
      ]

      // Normalize -> JsonArray -> back to AdditionalLink[]
      const normalized = normalizeAdditionalLinks(original)
      const asJson: Prisma.JsonArray = normalized as unknown as Prisma.JsonArray
      const backToLinks = normalizeAdditionalLinks(asJson)

      expect(backToLinks).toEqual(normalized)
    })

    it("handles Prisma.JsonObject with link properties", () => {
      // Simulate a JsonObject that might come from database
      const jsonObject: Prisma.JsonObject = {
        url: "https://example.com",
        title: "From JSON",
      }

      const result = normalizeAdditionalLink(jsonObject)

      expect(result).toEqual({
        url: "https://example.com",
        title: "From JSON",
      })
    })
  })

  describe("Nostr tag conversion", () => {
    it("converts AdditionalLinks to Nostr tags", () => {
      const links: AdditionalLink[] = [
        { url: "https://example.com", title: "Example" },
        { url: "https://github.com" },
      ]

      const tags = additionalLinksToTags(links)

      expect(tags).toEqual([
        ["r", "https://example.com", "Example"],
        ["r", "https://github.com"],
      ])
    })

    it("converts Nostr tags back to AdditionalLinks", () => {
      const tags: string[][] = [
        ["r", "https://example.com", "Example Site"],
        ["r", "https://github.com"],
        ["t", "topic"], // Non-'r' tag should be ignored
      ]

      const links = tagsToAdditionalLinks(tags)

      expect(links).toEqual([
        { url: "https://example.com", title: "Example Site" },
        { url: "https://github.com" },
      ])
    })

    it("round-trips links through tag conversion", () => {
      const original: AdditionalLink[] = [
        { url: "https://example.com", title: "Test" },
        { url: "https://docs.example.com" },
      ]

      const tags = additionalLinksToTags(original)
      const recovered = tagsToAdditionalLinks(tags)

      expect(recovered).toEqual(original)
    })
  })
})
