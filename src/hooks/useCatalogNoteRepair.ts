import { useEffect, useMemo, useRef, useState } from "react"
import type { NostrEvent } from "snstr"

import type { ContentItem } from "@/data/types"
import { applyResolvedNoteToContentItem } from "@/lib/content-note-resolution"
import { fetchEventFromReference, fetchEventsByReferences } from "@/lib/note-reference-resolution"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { getRelays } from "@/lib/nostr-relays"

const CATALOG_NOTE_KINDS = [30004, 30023, 30402, 30403]
const CATALOG_EVENT_PRIORITY = {
  30004: 4,
  30023: 3,
  30402: 2,
  30403: 1,
} as const

export function useCatalogNoteRepair(items: ContentItem[]): ContentItem[] {
  const [repairedItemsById, setRepairedItemsById] = useState<Map<string, ContentItem>>(new Map())
  const attemptedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unresolvedItems = items.filter((item) => {
      if (item.noteResolved === true || !item.noteId) {
        return false
      }

      if (repairedItemsById.has(item.id)) {
        return false
      }

      const attemptKey = `${item.id}:${item.noteId}`
      return !attemptedKeysRef.current.has(attemptKey)
    })

    if (unresolvedItems.length === 0) {
      return
    }

    unresolvedItems.forEach((item) => {
      attemptedKeysRef.current.add(`${item.id}:${item.noteId}`)
    })

    let cancelled = false

    const repairItems = async () => {
      const relays = getRelays("default")
      const eventsByDTag = await NostrFetchService.fetchEventsByDTags(
        unresolvedItems.map((item) => item.id),
        CATALOG_NOTE_KINDS,
        undefined,
        undefined,
        relays
      )

      const fallbackItems = unresolvedItems.filter((item) => !eventsByDTag.has(item.id) && item.noteId)
      const eventsByNoteId = fallbackItems.length > 0
        ? await fetchEventsByReferences(
            Array.from(new Set(fallbackItems.flatMap((item) => (item.noteId ? [item.noteId] : [])))),
            {
              allowedKinds: CATALOG_NOTE_KINDS,
              priorityConfig: CATALOG_EVENT_PRIORITY,
              relays,
            }
          )
        : new Map<string, NostrEvent>()

      const remainingFallbackItems = fallbackItems.filter(
        (item) => item.noteId && !eventsByNoteId.has(item.noteId)
      )
      const eventsBySingleReference = new Map<string, NostrEvent>()

      if (remainingFallbackItems.length > 0) {
        await Promise.all(
          remainingFallbackItems.map(async (item) => {
            if (!item.noteId) {
              return
            }

            const event = await fetchEventFromReference(item.noteId, {
              allowedKinds: CATALOG_NOTE_KINDS,
              priorityConfig: CATALOG_EVENT_PRIORITY,
              relays,
            })

            if (event) {
              eventsBySingleReference.set(item.noteId, event)
            }
          })
        )
      }

      if (cancelled) {
        return
      }

      setRepairedItemsById((current) => {
        const next = new Map(current)

        unresolvedItems.forEach((item) => {
          const note =
            eventsByDTag.get(item.id) ??
            (item.noteId ? eventsByNoteId.get(item.noteId) ?? eventsBySingleReference.get(item.noteId) : undefined)

          if (note) {
            next.set(item.id, applyResolvedNoteToContentItem(item, note))
          }
        })

        return next
      })
    }

    void repairItems()

    return () => {
      cancelled = true
    }
  }, [items, repairedItemsById])

  return useMemo(
    () => items.map((item) => repairedItemsById.get(item.id) ?? item),
    [items, repairedItemsById]
  )
}
