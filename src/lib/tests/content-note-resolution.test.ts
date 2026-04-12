import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveCatalogEventsByIdentity, applyResolvedNoteToContentItem } from "@/lib/content-note-resolution"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import type { ContentItem, NostrEvent } from "@/data/types"

const COURSE_EVENT: NostrEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 30004,
  tags: [
    ["d", "course-1"],
    ["title", "Resolved Course"],
    ["about", "Course summary"],
    ["image", "https://example.com/course.png"],
    ["t", "bitcoin"],
  ],
  content: "",
  sig: "c".repeat(128),
}

const RESOURCE_EVENT: NostrEvent = {
  id: "d".repeat(64),
  pubkey: "e".repeat(64),
  created_at: 1_700_000_001,
  kind: 30023,
  tags: [
    ["d", "resource-1"],
    ["title", "Resolved Resource"],
    ["summary", "Resource summary"],
    ["image", "https://example.com/resource.png"],
    ["t", "video"],
    ["t", "lightning"],
  ],
  content: "",
  sig: "f".repeat(128),
}

describe("resolveCatalogEventsByIdentity", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves by d-tag when db id already matches the note identifier", async () => {
    vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(
      new Map([["course-1", COURSE_EVENT]])
    )
    const fetchByIdsSpy = vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(new Map())

    const result = await resolveCatalogEventsByIdentity(
      [{ id: "course-1", noteId: "legacy-note", type: "course" }],
      [30004]
    )

    expect(result.eventsByEntityId.get("course-1")).toEqual(COURSE_EVENT)
    expect(result.unresolvedEntityIds.size).toBe(0)
    expect(fetchByIdsSpy).not.toHaveBeenCalled()
  })

  it("falls back to noteId when d-tag lookup misses", async () => {
    vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(new Map())
    vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(
      new Map([[RESOURCE_EVENT.id, RESOURCE_EVENT]])
    )

    const result = await resolveCatalogEventsByIdentity(
      [{ id: "resource-1", noteId: RESOURCE_EVENT.id, type: "video" }],
      [30023, 30402, 30403]
    )

    expect(result.eventsByEntityId.get("resource-1")).toEqual(RESOURCE_EVENT)
    expect(result.unresolvedEntityIds.size).toBe(0)
  })

  it("leaves items unresolved when neither lookup path finds a note", async () => {
    vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(new Map())
    vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(new Map())

    const result = await resolveCatalogEventsByIdentity(
      [{ id: "missing-course", noteId: "missing-note", type: "course" }],
      [30004]
    )

    expect(result.eventsByEntityId.size).toBe(0)
    expect(result.unresolvedEntityIds).toEqual(new Set(["missing-course"]))
  })
})

describe("applyResolvedNoteToContentItem", () => {
  it("merges resolved note fields into existing content items", () => {
    const fallbackItem: ContentItem = {
      id: "resource-1",
      type: "document",
      title: "Document resource-1",
      description: "",
      category: "general",
      instructor: "Fallback Author",
      instructorPubkey: "",
      rating: 4.5,
      isPremium: false,
      price: 0,
      currency: "sats",
      image: undefined,
      published: true,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      topics: [],
      additionalLinks: [],
      noteId: RESOURCE_EVENT.id,
      noteResolved: false,
    }

    const repaired = applyResolvedNoteToContentItem(fallbackItem, RESOURCE_EVENT)

    expect(repaired.title).toBe("Resolved Resource")
    expect(repaired.image).toBe("https://example.com/resource.png")
    expect(repaired.topics).toEqual(["video", "lightning"])
    expect(repaired.noteResolved).toBe(true)
    expect(repaired.noteId).toBe(RESOURCE_EVENT.id)
  })
})
