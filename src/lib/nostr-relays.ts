import nostrConfig from "../../config/nostr.json"

export type RelaySet = 'default' | 'content' | 'profile' | 'zapThreads'
type RelayConfigKey = RelaySet | 'custom'

type NostrRelayConfig = {
  relays?: Partial<Record<RelayConfigKey, unknown[]>>
}

export function unique(list: string[]): string[] {
  return Array.from(new Set(list))
}

function normalizeRelayList(relays?: readonly unknown[]): string[] {
  return unique(
    (relays ?? [])
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.trim())
      .filter(Boolean)
  )
}

const relayConfig = (nostrConfig as NostrRelayConfig).relays ?? {}
const ALLOWED_RELAY_SETS: RelaySet[] = ['default', 'content', 'profile', 'zapThreads']

export const DEFAULT_RELAYS = normalizeRelayList(relayConfig.default)

const RELAYS_BY_SET: Record<RelaySet, string[]> = {
  default: DEFAULT_RELAYS,
  content: normalizeRelayList(relayConfig.content),
  profile: normalizeRelayList(relayConfig.profile),
  zapThreads: normalizeRelayList(relayConfig.zapThreads),
}

const CUSTOM_RELAYS = normalizeRelayList(relayConfig.custom)

export const RELAY_ALLOWLIST = unique(
  ALLOWED_RELAY_SETS.flatMap((set) => RELAYS_BY_SET[set]).concat(CUSTOM_RELAYS)
)

export function normalizeRelayUrl(url: URL): string {
  const base = `${url.protocol}//${url.host}`
  return url.pathname && url.pathname !== "/" ? `${base}${url.pathname}` : base
}

/**
 * Get relays for a given set, falling back to `default` when the set is
 * undefined or empty. Ensures the list is de-duplicated.
 */
export function getRelays(set: RelaySet = 'default'): string[] {
  const relays = RELAYS_BY_SET[set]
  return [...(relays.length > 0 ? relays : DEFAULT_RELAYS)]
}
