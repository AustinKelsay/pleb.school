import type { CourseUser } from "@/data/types"
import type { NormalizedProfile } from "@/hooks/useNostr"

export type ProfileUserLike = Pick<
  CourseUser,
  "displayName" | "username" | "pubkey" | "avatar" | "nip05" | "lud16"
>

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim()
}

export function formatPubkeyWithEllipsis(pubkey?: string | null): string {
  const normalized = pubkey?.trim()
  if (!normalized) return ""
  if (normalized.length <= 12) return normalized
  return `${normalized.slice(0, 12)}...${normalized.slice(-6)}`
}

export function profileSummaryFromUser(user?: ProfileUserLike | null): NormalizedProfile | null {
  if (!user) return null

  const summary: NormalizedProfile = {
    name: user.displayName ?? user.username ?? undefined,
    display_name: user.displayName ?? undefined,
    picture: user.avatar ?? undefined,
    nip05: user.nip05 ?? undefined,
    lud16: user.lud16 ?? undefined,
    pubkey: user.pubkey ?? undefined,
  }

  return Object.values(summary).some((value) => value !== undefined)
    ? summary
    : null
}

export function resolvePreferredDisplayName(options: {
  profile?: NormalizedProfile | null
  preferredNames?: Array<string | null | undefined>
  user?: ProfileUserLike | null
  pubkey?: string | null
  fallback?: string | null
}): string {
  const { profile, preferredNames = [], user, pubkey, fallback } = options

  return (
    firstNonEmpty([
      profile?.name,
      profile?.display_name,
      ...preferredNames,
      user?.displayName ?? undefined,
      user?.username ?? undefined,
      fallback ?? undefined,
    ])?.trim() ||
    formatPubkeyWithEllipsis(user?.pubkey ?? pubkey) ||
    ""
  )
}
