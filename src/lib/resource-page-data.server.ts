import type { AddressData, EventData, NostrEvent } from "snstr"

import type { ResourceContentInitialMeta } from "@/app/content/components/resource-content-meta"
import { checkCourseUnlockViaLessons } from "@/lib/course-access"
import { ResourceAdapter } from "@/lib/db-adapter"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { getRelays } from "@/lib/nostr-relays"
import { resolveUniversalId } from "@/lib/universal-router"

interface GetResourcePageDataOptions {
  resourceId: string
  viewerUserId?: string | null
}

interface ResourcePageData {
  event: NostrEvent | null
  initialMeta: ResourceContentInitialMeta | null
  shouldNotFound: boolean
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESOURCE_EVENT_KINDS = [30023, 30402, 30403]

function isUuidResourceId(resourceId: string): boolean {
  return UUID_REGEX.test(resourceId)
}

function getEventPriority(kind: number): number {
  if (kind === 30023) return 3
  if (kind === 30402) return 2
  if (kind === 30403) return 1
  return 0
}

function selectPreferredEvent(events: NostrEvent[]): NostrEvent | null {
  if (events.length === 0) {
    return null
  }

  return events.slice(1).reduce((selected, candidate) => {
    if (candidate.created_at > selected.created_at) {
      return candidate
    }

    if (candidate.created_at < selected.created_at) {
      return selected
    }

    return getEventPriority(candidate.kind) > getEventPriority(selected.kind)
      ? candidate
      : selected
  }, events[0])
}

async function fetchResourceEvent(resourceId: string): Promise<NostrEvent | null> {
  const resolved = resolveUniversalId(resourceId)
  if (!resolved) {
    return null
  }

  if (resolved.idType === "nevent" && resolved.decodedData && typeof resolved.decodedData === "object" && "id" in resolved.decodedData) {
    const eventData = resolved.decodedData as EventData
    const relays =
      Array.isArray(eventData.relays) && eventData.relays.length > 0
        ? eventData.relays
        : getRelays("default")
    return NostrFetchService.fetchEventById(
      eventData.id,
      undefined,
      relays
    )
  }

  if (
    resolved.idType === "naddr" &&
    resolved.decodedData &&
    typeof resolved.decodedData === "object" &&
    "identifier" in resolved.decodedData &&
    "kind" in resolved.decodedData
  ) {
    const addressData = resolved.decodedData as AddressData
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

    return selectPreferredEvent(events)
  }

  if (resolved.idType === "note" || resolved.idType === "hex") {
    return NostrFetchService.fetchEventById(resolved.resolvedId)
  }

  const events = await NostrFetchService.fetchEventsByFilters([
    {
      kinds: RESOURCE_EVENT_KINDS,
      "#d": [resolved.resolvedId],
      limit: 10,
    },
  ])

  return selectPreferredEvent(events)
}

async function fetchResourceInitialMeta(
  resourceId: string,
  viewerUserId?: string | null
): Promise<{ exists: boolean; meta: ResourceContentInitialMeta | null }> {
  if (!isUuidResourceId(resourceId)) {
    return {
      exists: true,
      meta: null,
    }
  }

  const resource = await ResourceAdapter.getResourceSnapshot(resourceId, viewerUserId)

  if (!resource) {
    return {
      exists: false,
      meta: null,
    }
  }

  const courseAccess = await checkCourseUnlockViaLessons({
    userId: viewerUserId ?? undefined,
    resourceId,
    lessons: resource.lessons,
  })

  const hasPurchased = Array.isArray(resource.purchases)
    ? resource.purchases.some((purchase) => {
        const snapshot =
          purchase.priceAtPurchase !== null &&
          purchase.priceAtPurchase !== undefined &&
          purchase.priceAtPurchase > 0
            ? purchase.priceAtPurchase
            : null
        const currentPrice = resource.price ?? 0
        const required = snapshot !== null ? Math.min(snapshot, currentPrice) : currentPrice
        return purchase.amountPaid >= required
      })
    : false

  return {
    exists: true,
    meta: {
      resourceUser: resource.user
        ? {
            id: resource.user.id,
            username: resource.user.username,
            pubkey: resource.user.pubkey,
            avatar: resource.user.avatar,
            nip05: resource.user.nip05,
            lud16: resource.user.lud16,
            displayName: resource.user.displayName,
          }
        : null,
      serverPrice: typeof resource.price === "number" ? resource.price : null,
      serverPurchased: hasPurchased || courseAccess.unlockedViaCourse,
      serverIsOwner: Boolean(viewerUserId && resource.userId === viewerUserId),
      unlockedViaCourse: courseAccess.unlockedViaCourse,
      unlockingCourseId: courseAccess.unlockingCourseId,
    },
  }
}

export async function getResourcePageData({
  resourceId,
  viewerUserId,
}: GetResourcePageDataOptions): Promise<ResourcePageData> {
  const [{ exists, meta }, event] = await Promise.all([
    fetchResourceInitialMeta(resourceId, viewerUserId),
    fetchResourceEvent(resourceId),
  ])

  if (!exists) {
    return {
      event: null,
      initialMeta: null,
      shouldNotFound: true,
    }
  }

  return {
    event,
    initialMeta: meta,
    shouldNotFound: event === null,
  }
}
