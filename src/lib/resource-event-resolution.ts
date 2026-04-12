import type { AddressData, EventData, Filter, NostrEvent } from "snstr"

import {
  selectPreferredEventFromList,
  type EventPriorityConfig,
} from "@/lib/nostr-event-priority"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { getRelays } from "@/lib/nostr-relays"
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

  if (resolved.idType === "nevent" && resolved.decodedData && typeof resolved.decodedData === "object" && "id" in resolved.decodedData) {
    const eventData = resolved.decodedData as EventData
    const relays =
      Array.isArray(eventData.relays) && eventData.relays.length > 0
        ? eventData.relays
        : getRelays("default")

    return {
      resolved,
      event: await NostrFetchService.fetchEventById(eventData.id, undefined, relays),
      error: null,
    }
  }

  if (
    resolved.idType === "naddr" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "identifier" in resolved.decodedData &&
    "kind" in resolved.decodedData
  ) {
    const addressData = resolved.decodedData as AddressData
    if (!RESOURCE_ONLY_KINDS.has(addressData.kind)) {
      return {
        resolved,
        event: null,
        error: "Unsupported identifier",
      }
    }

    const relays =
      Array.isArray(addressData.relays) && addressData.relays.length > 0
        ? addressData.relays
        : getRelays("default")

    const events = await NostrFetchService.fetchEventsByFilters(
      [
        {
          kinds: [addressData.kind],
          "#d": [addressData.identifier],
          authors: addressData.pubkey ? [addressData.pubkey] : undefined,
          limit: 10,
        },
      ],
      undefined,
      relays
    )

    return {
      resolved,
      event: selectPreferredEventFromList(events, RESOURCE_EVENT_PRIORITY),
      error: null,
    }
  }

  if (resolved.idType === "note" || resolved.idType === "hex") {
    return {
      resolved,
      event: await NostrFetchService.fetchEventById(resolved.resolvedId),
      error: null,
    }
  }

  const event =
    (await fetchPreferredResourceEventByDTag(resolved.resolvedId)) ||
    (fallbackNoteId ? await NostrFetchService.fetchEventById(fallbackNoteId) : null)

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

  if (resolved.idType === "nevent" && resolved.decodedData && typeof resolved.decodedData === "object" && "id" in resolved.decodedData) {
    const eventData = resolved.decodedData as EventData
    return {
      resolved,
      event: await fetchSingleEvent(
        { ids: [eventData.id] },
        { relays: eventData.relays }
      ),
      error: null,
    }
  }

  if (
    resolved.idType === "naddr" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "identifier" in resolved.decodedData &&
    "kind" in resolved.decodedData
  ) {
    const addressData = resolved.decodedData as AddressData
    if (!RESOURCE_ONLY_KINDS.has(addressData.kind)) {
      return {
        resolved,
        event: null,
        error: "Unsupported identifier",
      }
    }

    return {
      resolved,
      event: await fetchSingleEvent(
        {
          kinds: [addressData.kind],
          "#d": [addressData.identifier],
          authors: addressData.pubkey ? [addressData.pubkey] : undefined,
        },
        {
          relays: addressData.relays,
        }
      ),
      error: null,
    }
  }

  if (resolved.idType === "note" || resolved.idType === "hex") {
    return {
      resolved,
      event: await fetchSingleEvent({
        ids: [resolved.resolvedId],
      }),
      error: null,
    }
  }

  const event =
    (await fetchPreferredClientResourceEventByDTag(resolved.resolvedId, fetchSingleEvent)) ||
    (fallbackNoteId
      ? await fetchSingleEvent({
          ids: [fallbackNoteId],
        })
      : null)

  return {
    resolved,
    event,
    error: null,
  }
}
