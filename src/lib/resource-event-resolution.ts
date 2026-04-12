import type { Filter, NostrEvent } from "snstr"

import {
  selectPreferredEventFromList,
  type EventPriorityConfig,
} from "@/lib/nostr-event-priority"
import {
  fetchEventFromReference,
  fetchEventFromReferenceWithClientFetcher,
} from "@/lib/note-reference-resolution"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { resolveUniversalId, type UniversalIdResult } from "@/lib/universal-router"

export interface ResourceEventLookupResult {
  resolved: UniversalIdResult | null
  event: NostrEvent | null
  error: string | null
}

export type ClientEventFetcher = (
  filter: Filter,
  options?: { timeout?: number; relays?: string[] }
) => Promise<NostrEvent | null>

export const RESOURCE_EVENT_KINDS = [30023, 30402, 30403]
export const RESOURCE_ONLY_KINDS = new Set(RESOURCE_EVENT_KINDS)
export const RESOURCE_EVENT_PRIORITY: EventPriorityConfig = {
  30023: 3,
  30402: 2,
  30403: 1,
}

async function fetchPreferredResourceEventByDTag(identifier: string): Promise<NostrEvent | null> {
  const events = await NostrFetchService.fetchEventsByFilters([
    {
      kinds: RESOURCE_EVENT_KINDS,
      "#d": [identifier],
      limit: 10,
    },
  ])

  return selectPreferredEventFromList(events, RESOURCE_EVENT_PRIORITY)
}

async function fetchPreferredClientResourceEventByDTag(
  identifier: string,
  fetchSingleEvent: ClientEventFetcher
): Promise<NostrEvent | null> {
  return fetchSingleEvent({
    kinds: RESOURCE_EVENT_KINDS,
    "#d": [identifier],
  })
}

export async function fetchResourceEventOnServer(
  resourceId: string,
  fallbackNoteId?: string | null
): Promise<ResourceEventLookupResult> {
  const resolved = resolveUniversalId(resourceId)
  if (!resolved) {
    return {
      resolved: null,
      event: null,
      error: "Unsupported identifier",
    }
  }

  if (resolved.idType === "nevent" || resolved.idType === "naddr" || resolved.idType === "note" || resolved.idType === "hex") {
    return {
      resolved,
      event: await fetchEventFromReference(resourceId, {
        allowedKinds: RESOURCE_EVENT_KINDS,
        priorityConfig: RESOURCE_EVENT_PRIORITY,
      }),
      error: null,
    }
  }

  const event =
    (await fetchPreferredResourceEventByDTag(resolved.resolvedId)) ||
    (fallbackNoteId
      ? await fetchEventFromReference(fallbackNoteId, {
          allowedKinds: RESOURCE_EVENT_KINDS,
          priorityConfig: RESOURCE_EVENT_PRIORITY,
        })
      : null)

  return {
    resolved,
    event,
    error: null,
  }
}

export async function fetchResourceEventOnClient(
  resourceId: string,
  fetchSingleEvent: ClientEventFetcher,
  fallbackNoteId?: string | null
): Promise<ResourceEventLookupResult> {
  const resolved = resolveUniversalId(resourceId)
  if (!resolved) {
    return {
      resolved: null,
      event: null,
      error: "Unsupported identifier",
    }
  }

  if (resolved.idType === "nevent" || resolved.idType === "naddr" || resolved.idType === "note" || resolved.idType === "hex") {
    return {
      resolved,
      event: await fetchEventFromReferenceWithClientFetcher(
        resourceId,
        fetchSingleEvent,
        {
          allowedKinds: RESOURCE_EVENT_KINDS,
          priorityConfig: RESOURCE_EVENT_PRIORITY,
        }
      ),
      error: null,
    }
  }

  const event =
    (await fetchPreferredClientResourceEventByDTag(resolved.resolvedId, fetchSingleEvent)) ||
    (fallbackNoteId
      ? await fetchEventFromReferenceWithClientFetcher(
          fallbackNoteId,
          fetchSingleEvent,
          {
            allowedKinds: RESOURCE_EVENT_KINDS,
            priorityConfig: RESOURCE_EVENT_PRIORITY,
          }
        )
      : null)

  return {
    resolved,
    event,
    error: null,
  }
}
