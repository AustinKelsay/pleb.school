import type { AddressData, EventData, Filter, NostrEvent } from "snstr"

import {
  selectPreferredEventFromList,
  type EventPriorityConfig,
} from "@/lib/nostr-event-priority"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { getRelays, unique } from "@/lib/nostr-relays"
import { resolveUniversalId } from "@/lib/universal-router"

const HEX_64_REGEX = /^[0-9a-f]{64}$/i

export interface NoteReferenceResolutionOptions {
  allowedKinds?: number[]
  priorityConfig?: EventPriorityConfig
  relays?: string[]
}

export type NoteReferenceClientFetcher = (
  filter: Filter,
  options?: { timeout?: number; relays?: string[] }
) => Promise<NostrEvent | null>

function isAllowedKind(event: NostrEvent | null, allowedKinds?: number[]): event is NostrEvent {
  if (!event) {
    return false
  }

  return !allowedKinds || allowedKinds.length === 0 || allowedKinds.includes(event.kind)
}

function getPriorityConfig(options: NoteReferenceResolutionOptions): EventPriorityConfig {
  return options.priorityConfig ?? {}
}

function getDefaultRelays(options: NoteReferenceResolutionOptions): string[] {
  return options.relays && options.relays.length > 0 ? options.relays : getRelays("default")
}

function mergeRelayCandidates(explicitRelays: string[] | undefined, options: NoteReferenceResolutionOptions): string[] {
  return unique([...(explicitRelays ?? []), ...getDefaultRelays(options)])
}

function getNormalizedHexEventId(value: string): string | null {
  const trimmedValue = value.trim()
  return HEX_64_REGEX.test(trimmedValue) ? trimmedValue.toLowerCase() : null
}

async function fetchAddressedEvent(
  addressData: AddressData,
  options: NoteReferenceResolutionOptions
): Promise<NostrEvent | null> {
  if (options.allowedKinds && options.allowedKinds.length > 0 && !options.allowedKinds.includes(addressData.kind)) {
    return null
  }

  const relays = mergeRelayCandidates(
    Array.isArray(addressData.relays) ? addressData.relays : undefined,
    options
  )
  const filter: Filter = {
    kinds: [addressData.kind],
    "#d": [addressData.identifier],
    authors: addressData.pubkey ? [addressData.pubkey] : undefined,
    limit: 10,
  }

  const events = await NostrFetchService.fetchEventsByFilters(
    [filter],
    undefined,
    relays
  )

  const selectedEvent = selectPreferredEventFromList(events, getPriorityConfig(options))
  if (isAllowedKind(selectedEvent, options.allowedKinds)) {
    return selectedEvent
  }

  for (const relay of relays) {
    const relayEvents = await NostrFetchService.fetchEventsByFilters(
      [filter],
      undefined,
      [relay],
      1500
    )
    const relaySelectedEvent = selectPreferredEventFromList(relayEvents, getPriorityConfig(options))
    if (isAllowedKind(relaySelectedEvent, options.allowedKinds)) {
      return relaySelectedEvent
    }
  }

  return null
}

async function fetchAddressedEventWithClientFetcher(
  addressData: AddressData,
  fetchSingleEvent: NoteReferenceClientFetcher,
  options: NoteReferenceResolutionOptions
): Promise<NostrEvent | null> {
  if (options.allowedKinds && options.allowedKinds.length > 0 && !options.allowedKinds.includes(addressData.kind)) {
    return null
  }

  const event = await fetchSingleEvent(
    {
      kinds: [addressData.kind],
      "#d": [addressData.identifier],
      authors: addressData.pubkey ? [addressData.pubkey] : undefined,
    },
    {
      relays: mergeRelayCandidates(
        Array.isArray(addressData.relays) ? addressData.relays : undefined,
        options
      ),
    }
  )

  return isAllowedKind(event, options.allowedKinds) ? event : null
}

export async function fetchEventFromReference(
  noteReference: string | null | undefined,
  options: NoteReferenceResolutionOptions = {}
): Promise<NostrEvent | null> {
  const trimmedReference = noteReference?.trim()
  if (!trimmedReference) {
    return null
  }

  const resolved = resolveUniversalId(trimmedReference)
  if (!resolved) {
    return null
  }

  if (
    resolved.idType === "naddr" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "identifier" in resolved.decodedData &&
    "kind" in resolved.decodedData
  ) {
    return fetchAddressedEvent(resolved.decodedData as AddressData, options)
  }

  if (
    resolved.idType === "nevent" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "id" in resolved.decodedData
  ) {
    const eventData = resolved.decodedData as EventData
    const relays = mergeRelayCandidates(
      Array.isArray(eventData.relays) ? eventData.relays : undefined,
      options
    )

    const event = await NostrFetchService.fetchEventById(eventData.id, undefined, relays)
    return isAllowedKind(event, options.allowedKinds) ? event : null
  }

  if (resolved.idType === "hex" || resolved.idType === "note") {
    const eventId = getNormalizedHexEventId(resolved.resolvedId)
    if (!eventId) {
      return null
    }

    const event = await NostrFetchService.fetchEventById(eventId, undefined, getDefaultRelays(options))
    return isAllowedKind(event, options.allowedKinds) ? event : null
  }

  return null
}

export async function fetchEventsByReferences(
  noteReferences: string[],
  options: NoteReferenceResolutionOptions = {}
): Promise<Map<string, NostrEvent>> {
  const eventsByReference = new Map<string, NostrEvent>()
  const normalizedReferences = Array.from(
    new Set(
      noteReferences
        .map((noteReference) => noteReference.trim())
        .filter((noteReference) => noteReference.length > 0)
    )
  )

  if (normalizedReferences.length === 0) {
    return eventsByReference
  }

  const eventIdReferences = new Map<string, string[]>()
  const deferredReferences: Array<Promise<void>> = []

  normalizedReferences.forEach((reference) => {
    const resolved = resolveUniversalId(reference)
    if (!resolved) {
      return
    }

    if (resolved.idType === "hex" || resolved.idType === "note") {
      const eventId = getNormalizedHexEventId(resolved.resolvedId)
      if (!eventId) {
        return
      }

      const referencesForEventId = eventIdReferences.get(eventId) ?? []
      referencesForEventId.push(reference)
      eventIdReferences.set(eventId, referencesForEventId)
      return
    }

    deferredReferences.push(
      fetchEventFromReference(reference, options).then((event) => {
        if (event) {
          eventsByReference.set(reference, event)
        }
      })
    )
  })

  const eventIds = Array.from(eventIdReferences.keys())
  if (eventIds.length > 0) {
    const eventsById = await NostrFetchService.fetchEventsByIds(
      eventIds,
      undefined,
      getDefaultRelays(options)
    )

    eventIdReferences.forEach((references, eventId) => {
      const event = eventsById.get(eventId)
      if (!event || !isAllowedKind(event, options.allowedKinds)) {
        return
      }

      references.forEach((reference) => eventsByReference.set(reference, event))
    })
  }

  if (deferredReferences.length > 0) {
    await Promise.all(deferredReferences)
  }

  return eventsByReference
}

export async function fetchEventFromReferenceWithClientFetcher(
  noteReference: string | null | undefined,
  fetchSingleEvent: NoteReferenceClientFetcher,
  options: NoteReferenceResolutionOptions = {}
): Promise<NostrEvent | null> {
  const trimmedReference = noteReference?.trim()
  if (!trimmedReference) {
    return null
  }

  const resolved = resolveUniversalId(trimmedReference)
  if (!resolved) {
    return null
  }

  if (
    resolved.idType === "naddr" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "identifier" in resolved.decodedData &&
    "kind" in resolved.decodedData
  ) {
    return fetchAddressedEventWithClientFetcher(
      resolved.decodedData as AddressData,
      fetchSingleEvent,
      options
    )
  }

  if (
    resolved.idType === "nevent" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "id" in resolved.decodedData
  ) {
    const eventData = resolved.decodedData as EventData
    const event = await fetchSingleEvent(
      { ids: [eventData.id] },
      {
        relays: mergeRelayCandidates(
          Array.isArray(eventData.relays) ? eventData.relays : undefined,
          options
        ),
      }
    )

    return isAllowedKind(event, options.allowedKinds) ? event : null
  }

  if (resolved.idType === "hex" || resolved.idType === "note") {
    const eventId = getNormalizedHexEventId(resolved.resolvedId)
    if (!eventId) {
      return null
    }

    const event = await fetchSingleEvent(
      { ids: [eventId] },
      { relays: getDefaultRelays(options) }
    )
    return isAllowedKind(event, options.allowedKinds) ? event : null
  }

  return null
}
