// @vitest-environment jsdom

import { act, createElement, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { encodeAddress } from "snstr"

import type { ContentItem, NostrEvent } from "@/data/types"
import { useCatalogNoteRepair } from "@/hooks/useCatalogNoteRepair"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import * as noteReferenceResolution from "@/lib/note-reference-resolution"

const RESOURCE_EVENT: NostrEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 30023,
  tags: [
    ["d", "resource-1"],
    ["title", "Resolved Resource"],
    ["summary", "Summary"],
    ["image", "https://example.com/image.png"],
    ["t", "video"],
  ],
  content: "",
  sig: "c".repeat(128),
}

function mountHook(items: ContentItem[]) {
  const latestItemsRef: { current: ContentItem[] } = { current: [] }

  function Harness() {
    const repairedItems = useCatalogNoteRepair(items)
    useEffect(() => {
      latestItemsRef.current = repairedItems
    }, [repairedItems])
    return null
  }

  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Harness))
  })

  return {
    getItems: () => latestItemsRef.current,
    rerender(nextItems: ContentItem[]) {
      items = nextItems
      act(() => {
        root.render(createElement(Harness))
      })
    },
    unmount() {
      act(() => root.unmount())
    },
  }
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("useCatalogNoteRepair", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    vi.restoreAllMocks()
  })

  it("repairs unresolved items without refetching already resolved ones", async () => {
    const fetchByDTagsSpy = vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(new Map())
    const fetchByIdsSpy = vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(
      new Map([[RESOURCE_EVENT.id, RESOURCE_EVENT]])
    )

    const items: ContentItem[] = [
      {
        id: "course-1",
        type: "course",
        title: "Resolved Course",
        description: "",
        category: "general",
        instructor: "Author",
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
        noteId: "resolved-note",
        noteResolved: true,
      },
      {
        id: "resource-1",
        type: "document",
        title: "Document resource-1",
        description: "",
        category: "general",
        instructor: "Author",
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
      },
    ]

    const mounted = mountHook(items)
    await flushEffects()

    expect(fetchByDTagsSpy).toHaveBeenCalledWith(
      ["resource-1"],
      [30004, 30023, 30402, 30403],
      undefined,
      undefined,
      expect.any(Array)
    )
    expect(fetchByIdsSpy).toHaveBeenCalledTimes(1)
    expect(mounted.getItems()[1].title).toBe("Resolved Resource")
    expect(mounted.getItems()[1].noteResolved).toBe(true)

    mounted.rerender(items)
    await flushEffects()

    expect(fetchByIdsSpy).toHaveBeenCalledTimes(1)
    mounted.unmount()
  })

  it("repairs unresolved items whose stored noteId is an naddr reference", async () => {
    const naddr = encodeAddress({
      identifier: "resource-1",
      kind: 30023,
      pubkey: RESOURCE_EVENT.pubkey,
    })

    const fetchByDTagsSpy = vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(new Map())
    const fetchByIdsSpy = vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(new Map())
    vi.spyOn(NostrFetchService, "fetchEventsByFilters").mockResolvedValue([RESOURCE_EVENT])

    const items: ContentItem[] = [
      {
        id: "resource-1",
        type: "document",
        title: "Document resource-1",
        description: "",
        category: "general",
        instructor: "Author",
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
        noteId: naddr,
        noteResolved: false,
      },
    ]

    const mounted = mountHook(items)
    await flushEffects()

    expect(fetchByDTagsSpy).toHaveBeenCalledTimes(1)
    expect(fetchByIdsSpy).not.toHaveBeenCalled()
    expect(mounted.getItems()[0].title).toBe("Resolved Resource")

    mounted.unmount()
  })

  it("uses single-reference fallback when batched note repair still misses", async () => {
    vi.spyOn(NostrFetchService, "fetchEventsByDTags").mockResolvedValue(new Map())
    const fetchByIdsSpy = vi.spyOn(NostrFetchService, "fetchEventsByIds").mockResolvedValue(new Map())
    const singleReferenceSpy = vi
      .spyOn(noteReferenceResolution, "fetchEventFromReference")
      .mockResolvedValue(RESOURCE_EVENT)

    const items: ContentItem[] = [
      {
        id: "resource-1",
        type: "document",
        title: "Document resource-1",
        description: "",
        category: "general",
        instructor: "Author",
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
      },
    ]

    const mounted = mountHook(items)
    await flushEffects()

    expect(fetchByIdsSpy).toHaveBeenCalledTimes(1)
    expect(singleReferenceSpy).toHaveBeenCalledWith(
      RESOURCE_EVENT.id,
      expect.objectContaining({
        allowedKinds: [30004, 30023, 30402, 30403],
      })
    )
    expect(mounted.getItems()[0].title).toBe("Resolved Resource")

    mounted.unmount()
  })
})
