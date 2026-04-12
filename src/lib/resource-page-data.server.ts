import type { NostrEvent } from "snstr"

import type { ResourceContentInitialMeta } from "@/app/content/components/resource-content-meta"
import { checkCourseUnlockViaLessons } from "@/lib/course-access"
import { ResourceAdapter } from "@/lib/db-adapter"
import { fetchResourceEventOnServer } from "@/lib/resource-event-resolution"

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
function isUuidResourceId(resourceId: string): boolean {
  return UUID_REGEX.test(resourceId)
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
      resourceNoteId: resource.noteId,
    },
  }
}

export async function getResourcePageData({
  resourceId,
  viewerUserId,
}: GetResourcePageDataOptions): Promise<ResourcePageData> {
  const { exists, meta } = await fetchResourceInitialMeta(resourceId, viewerUserId)

  if (!exists) {
    return {
      event: null,
      initialMeta: null,
      shouldNotFound: true,
    }
  }

  const lookup = await fetchResourceEventOnServer(resourceId, meta?.resourceNoteId)

  return {
    event: lookup.event,
    initialMeta: meta,
    shouldNotFound: Boolean(lookup.error) || (!lookup.event && !isUuidResourceId(resourceId)),
  }
}
