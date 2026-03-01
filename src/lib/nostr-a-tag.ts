import type { NostrEvent } from "@/data/types"

type EventForATag = Pick<NostrEvent, "kind" | "pubkey" | "tags">

/**
 * Build an addressable-event a-tag (`kind:pubkey:d`) for interaction lookups.
 * Returns undefined for non-addressable events or when required fields are missing.
 */
export function getEventATag(event?: EventForATag | null): string | undefined {
  if (!event || typeof event.kind !== "number" || event.kind < 30000 || event.kind >= 40000) {
    return undefined
  }

  const pubkey = event.pubkey?.trim().toLowerCase()
  if (!pubkey) {
    return undefined
  }

  const dTag = event.tags?.find(
    (tag) => Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string" && tag[1].trim().length > 0
  )?.[1]?.trim()
  if (!dTag) {
    return undefined
  }

  return `${event.kind}:${pubkey}:${dTag}`
}
