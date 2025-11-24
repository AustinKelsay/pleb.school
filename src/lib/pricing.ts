import { prisma } from "@/lib/prisma"

export type PriceResolution = {
  price: number
  type: "resource" | "course"
  id: string
  noteId?: string | null
  ownerPubkey?: string | null
  ownerUserId?: string
}

/**
 * Resolve the canonical price for a piece of content.
 * Prefers database values; caller can layer Nostr price tags if needed.
 */
export async function resolvePriceForContent(params: {
  resourceId?: string
  courseId?: string
}): Promise<PriceResolution | null> {
  const { resourceId, courseId } = params

  if (resourceId && courseId) return null

  if (resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, price: true, noteId: true, userId: true, user: { select: { pubkey: true } } }
    })
    if (!resource) return null
    return {
      price: resource.price,
      type: "resource",
      id: resource.id,
      noteId: resource.noteId,
      ownerPubkey: resource.user?.pubkey ?? null,
      ownerUserId: resource.userId
    }
  }

  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, price: true, noteId: true, userId: true, user: { select: { pubkey: true } } }
    })
    if (!course) return null
    return {
      price: course.price,
      type: "course",
      id: course.id,
      noteId: course.noteId,
      ownerPubkey: course.user?.pubkey ?? null,
      ownerUserId: course.userId
    }
  }

  return null
}
