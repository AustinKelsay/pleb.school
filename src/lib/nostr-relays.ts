import nostrConfig from "../../config/nostr.json"

export type RelaySet = 'default' | 'content' | 'profile' | 'zapThreads'

type NostrRelayConfig = {
  relays: Record<string, string[]>
}

export function unique(list: string[]): string[] {
  return Array.from(new Set(list))
}

const relayConfig = (nostrConfig as unknown as NostrRelayConfig).relays || {}
const ALLOWED_RELAY_SETS: RelaySet[] = ['default', 'content', 'profile', 'zapThreads']
const CUSTOM_RELAYS = relayConfig.custom ?? []

export const RELAY_ALLOWLIST = unique(
  ALLOWED_RELAY_SETS.flatMap((set) => relayConfig[set] ?? []).concat(CUSTOM_RELAYS)
).map((url) => url.trim()).filter(Boolean)

export function normalizeRelayUrl(url: URL): string {
  const base = `${url.protocol}//${url.host}`
  return url.pathname && url.pathname !== "/" ? `${base}${url.pathname}` : base
}

/**
 * Get relays for a given set, falling back to `default` when the set is
 * undefined or empty. Ensures the list is de-duplicated.
 */
export function getRelays(set: RelaySet = 'default'): string[] {
  const cfg = (nostrConfig as unknown as NostrRelayConfig).relays || {}
  const chosen = cfg[set] || []
  const base = cfg.default || []
  const relays = chosen.length > 0 ? chosen : base
  return unique(relays)
}

export const DEFAULT_RELAYS = getRelays('default')
