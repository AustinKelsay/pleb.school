import { prisma } from "@/lib/prisma"

export type PriceResolution = {
  price: number
  type: "resource" | "course"
  id: string
  noteId?: string | null
  ownerPubkey?: string | null
  ownerUserId?: string
  priceSource?: "database" | "nostr" | "max"
  dbPrice?: number
  nostrPriceHint?: number
}

/**
 * Resolve the canonical price for a piece of content.
 * Database prices are authoritative; a Nostr price hint is only used when the DB has no price.
 */
export async function resolvePriceForContent(params: {
  resourceId?: string
  courseId?: string
  nostrPriceHint?: number
  onMismatch?: (details: { id: string; type: "resource" | "course"; dbPrice: number; nostrPrice: number; chosen: number }) => void
}): Promise<PriceResolution | null> {
  const { resourceId, courseId, nostrPriceHint = 0, onMismatch } = params

  if (resourceId && courseId) return null

  if (resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, price: true, noteId: true, userId: true, user: { select: { pubkey: true } } }
    })
    if (!resource) return null
    const hasDbPrice = typeof resource.price === "number" && resource.price >= 0
    const dbPrice = hasDbPrice ? resource.price ?? 0 : undefined
    const nostrPrice = Number.isFinite(nostrPriceHint) ? nostrPriceHint : undefined
    // DB is authoritative; only fall back to Nostr when no DB price exists.
    const resolved = hasDbPrice ? dbPrice! : nostrPrice ?? 0

    if (hasDbPrice && typeof onMismatch === "function" && typeof nostrPrice === "number" && nostrPrice !== dbPrice) {
      onMismatch({ id: resource.id, type: "resource", dbPrice: dbPrice ?? 0, nostrPrice: nostrPrice ?? 0, chosen: dbPrice ?? 0 })
    }

    return {
      price: resolved,
      type: "resource",
      id: resource.id,
      noteId: resource.noteId,
      ownerPubkey: resource.user?.pubkey ?? null,
      ownerUserId: resource.userId,
      priceSource: hasDbPrice ? "database" : "nostr",
      dbPrice: dbPrice ?? 0,
      nostrPriceHint
    }
  }

  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, price: true, noteId: true, userId: true, user: { select: { pubkey: true } } }
    })
    if (!course) return null
    const hasDbPrice = typeof course.price === "number" && course.price >= 0
    const dbPrice = hasDbPrice ? course.price ?? 0 : undefined
    const nostrPrice = Number.isFinite(nostrPriceHint) ? nostrPriceHint : undefined
    // DB is authoritative; only fall back to Nostr when no DB price exists.
    const resolved = hasDbPrice ? dbPrice! : nostrPrice ?? 0

    if (hasDbPrice && typeof onMismatch === "function" && typeof nostrPrice === "number" && nostrPrice !== dbPrice) {
      onMismatch({ id: course.id, type: "course", dbPrice: dbPrice ?? 0, nostrPrice: nostrPrice ?? 0, chosen: dbPrice ?? 0 })
    }

    return {
      price: resolved,
      type: "course",
      id: course.id,
      noteId: course.noteId,
      ownerPubkey: course.user?.pubkey ?? null,
      ownerUserId: course.userId,
      priceSource: hasDbPrice ? "database" : "nostr",
      dbPrice: dbPrice ?? 0,
      nostrPriceHint
    }
  }

  return null
}
