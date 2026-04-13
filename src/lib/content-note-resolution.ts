import {
  parseCourseEvent,
  parseEvent,
  type ContentItem,
  type NostrEvent,
} from "@/data/types"
import { getEventATag } from "@/lib/nostr-a-tag"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { fetchEventFromReference, fetchEventsByReferences } from "@/lib/note-reference-resolution"
import { getNoteImage } from "@/lib/note-image"

export interface CatalogNoteEntity {
  id: string
  noteId?: string | null
  authorPubkey?: string | null
  type: ContentItem["type"]
}

interface CatalogEventResolution {
  eventsByEntityId: Map<string, NostrEvent>
  unresolvedEntityIds: Set<string>
}

const RESOURCE_TYPES = new Set<ContentItem["type"]>(["document", "video"])
const COURSE_EVENT_PRIORITY = {
  30004: 1,
} as const
const RESOURCE_EVENT_PRIORITY = {
  30023: 3,
  30402: 2,
  30403: 1,
} as const

function getCatalogPriorityConfig(kinds: number[]) {
  return kinds.includes(30004) ? COURSE_EVENT_PRIORITY : RESOURCE_EVENT_PRIORITY
}

async function fetchCatalogEventsByScopedDTag(
  entities: Array<CatalogNoteEntity & { noteId?: string; authorPubkey?: string }>,
  kinds: number[]
): Promise<Map<string, NostrEvent>> {
  const eventsByEntityId = new Map<string, NostrEvent>()
  const entitiesByPubkey = new Map<string, Array<CatalogNoteEntity & { noteId?: string; authorPubkey?: string }>>()

  entities.forEach((entity) => {
    const pubkeyKey = entity.authorPubkey ?? ""
    const group = entitiesByPubkey.get(pubkeyKey) ?? []
    group.push(entity)
    entitiesByPubkey.set(pubkeyKey, group)
  })

  await Promise.all(
    Array.from(entitiesByPubkey.entries()).map(async ([pubkeyKey, group]) => {
      const dTagIds = group.map((entity) => entity.id)
      if (dTagIds.length === 0) {
        return
      }

      const scopedEvents = await NostrFetchService.fetchEventsByDTags(
        dTagIds,
        kinds,
        pubkeyKey || undefined
      )

      scopedEvents.forEach((event, dTag) => {
        if (group.some((entity) => entity.id === dTag)) {
          eventsByEntityId.set(dTag, event)
        }
      })
    })
  )

  return eventsByEntityId
}

export async function resolveCatalogEventsByIdentity(
  entities: CatalogNoteEntity[],
  kinds: number[]
): Promise<CatalogEventResolution> {
  const normalizedEntities = Array.from(
    new Map(
      entities
        .map((entity) => ({
          ...entity,
          id: entity.id.trim(),
          noteId: entity.noteId?.trim() || undefined,
          authorPubkey: entity.authorPubkey?.trim().toLowerCase() || undefined,
        }))
        .filter((entity) => entity.id.length > 0)
        .map((entity) => [entity.id, entity])
    ).values()
  )

  const eventsByEntityId = normalizedEntities.length > 0
    ? await fetchCatalogEventsByScopedDTag(normalizedEntities, kinds)
    : new Map<string, NostrEvent>()

  const fallbackEntities = normalizedEntities.filter(
    (entity) => !eventsByEntityId.has(entity.id) && Boolean(entity.noteId)
  )

  if (fallbackEntities.length > 0) {
    const eventsByNoteId = await fetchEventsByReferences(
      Array.from(new Set(fallbackEntities.flatMap((entity) => (entity.noteId ? [entity.noteId] : [])))),
      {
        allowedKinds: kinds,
        priorityConfig: getCatalogPriorityConfig(kinds),
      }
    )

    fallbackEntities.forEach((entity) => {
      if (!entity.noteId || eventsByEntityId.has(entity.id)) {
        return
      }

      const event = eventsByNoteId.get(entity.noteId)
      if (event) {
        eventsByEntityId.set(entity.id, event)
      }
    })
  }

  const remainingFallbackEntities = normalizedEntities.filter(
    (entity) => !eventsByEntityId.has(entity.id) && Boolean(entity.noteId)
  )

  if (remainingFallbackEntities.length > 0) {
    const priorityConfig = getCatalogPriorityConfig(kinds)

    await Promise.all(
      remainingFallbackEntities.map(async (entity) => {
        if (!entity.noteId || eventsByEntityId.has(entity.id)) {
          return
        }

        const event = await fetchEventFromReference(entity.noteId, {
          allowedKinds: kinds,
          priorityConfig,
        })

        if (event) {
          eventsByEntityId.set(entity.id, event)
        }
      })
    )
  }

  return {
    eventsByEntityId,
    unresolvedEntityIds: new Set(
      normalizedEntities
        .filter((entity) => !eventsByEntityId.has(entity.id))
        .map((entity) => entity.id)
    ),
  }
}

export function applyResolvedNoteToContentItem(
  item: ContentItem,
  note: NostrEvent
): ContentItem {
  if (item.type === "course") {
    const parsedCourse = parseCourseEvent(note)

    return {
      ...item,
      title: parsedCourse.title || parsedCourse.name || item.title,
      description: parsedCourse.description || item.description,
      category: parsedCourse.category || parsedCourse.topics[0] || item.category,
      image: parsedCourse.image || getNoteImage(note, item.image),
      tags: note.tags,
      instructor: parsedCourse.instructor || item.instructor,
      instructorPubkey: parsedCourse.instructorPubkey || note.pubkey || item.instructorPubkey,
      topics: parsedCourse.topics,
      additionalLinks: parsedCourse.additionalLinks ?? item.additionalLinks,
      noteId: note.id,
      noteATag: getEventATag(note),
      currency: parsedCourse.currency ?? item.currency,
      noteResolved: true,
    }
  }

  if (RESOURCE_TYPES.has(item.type)) {
    const parsedResource = parseEvent(note)

    return {
      ...item,
      type: parsedResource.type === "video" || item.type === "video" ? "video" : "document",
      title: parsedResource.title || item.title,
      description: parsedResource.summary || item.description,
      category: parsedResource.category || parsedResource.topics[0] || item.category,
      image: parsedResource.image || getNoteImage(note, item.image),
      tags: note.tags,
      instructor: parsedResource.author || item.instructor,
      instructorPubkey: parsedResource.authorPubkey || note.pubkey || item.instructorPubkey,
      topics: parsedResource.topics,
      additionalLinks: parsedResource.additionalLinks ?? item.additionalLinks,
      noteId: note.id,
      noteATag: getEventATag(note),
      currency: parsedResource.currency ?? item.currency,
      noteResolved: true,
    }
  }

  return item
}
