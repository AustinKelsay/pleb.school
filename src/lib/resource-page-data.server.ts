import type { AddressData, EventData, NostrEvent } from "snstr"

import type { ResourceContentInitialMeta } from "@/app/content/components/resource-content-meta"
import { checkCourseUnlockViaLessons } from "@/lib/course-access"
import { ResourceAdapter } from "@/lib/db-adapter"
import {
  selectPreferredEventFromList,
  type EventPriorityConfig,
} from "@/lib/nostr-event-priority"
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
const RESOURCE_ONLY_KINDS = new Set(RESOURCE_EVENT_KINDS)
const RESOURCE_EVENT_PRIORITY: EventPriorityConfig = {
  30023: 3,
  30402: 2,
  30403: 1,
}

function isUuidResourceId(resourceId: string): boolean {
  return UUID_REGEX.test(resourceId)
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
    if (!RESOURCE_ONLY_KINDS.has(addressData.kind)) {
      return null
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

    return selectPreferredEventFromList(events, RESOURCE_EVENT_PRIORITY)
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

  return selectPreferredEventFromList(events, RESOURCE_EVENT_PRIORITY)
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
