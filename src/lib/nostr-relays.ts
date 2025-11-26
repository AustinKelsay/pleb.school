import nostrConfig from "../../config/nostr.json"

export type RelaySet = 'default' | 'content' | 'profile' | 'zapThreads'

type NostrRelayConfig = {
  relays: Record<string, string[]>
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list))
}

/**
 * Browser-compatible IP address detection
 * Returns 0 for non-IP, 4 for IPv4, 6 for IPv6
 */
function isIP(host: string): number {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (ipv4Pattern.test(host)) {
    const parts = host.split('.').map(Number)
    if (parts.every(part => part >= 0 && part <= 255)) {
      return 4
    }
  }
  
  // IPv6 pattern (simplified check)
  const ipv6Pattern = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i
  if (ipv6Pattern.test(host) || host === '::1') {
    return 6
  }
  
  return 0
}

const relayConfig = (nostrConfig as unknown as NostrRelayConfig).relays || {}
const ALLOWED_RELAY_SETS: RelaySet[] = ['default', 'content', 'profile', 'zapThreads']
const CUSTOM_RELAYS = relayConfig.custom ?? []

const RELAY_ALLOWLIST = unique(
  ALLOWED_RELAY_SETS.flatMap((set) => relayConfig[set] ?? []).concat(CUSTOM_RELAYS)
).map((url) => url.trim()).filter(Boolean)

function isPrivateRelayHost(host: string): boolean {
  const lower = host.toLowerCase()
  if (
    lower === "localhost" ||
    lower === "local" ||
    lower === "ip6-localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".home.arpa") ||
    lower.endsWith(".internal")
  ) {
    return true
  }

  const ipVersion = isIP(host)
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number)
    if (parts.length === 4) {
      const [a, b] = parts
      if (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 0
      ) {
        return true
      }
    }
    return false
  }

  if (ipVersion === 6) {
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    )
  }

  return false
}

function normalizeRelayUrl(url: URL): string {
  const base = `${url.protocol}//${url.host}`
  return url.pathname && url.pathname !== "/" ? `${base}${url.pathname}` : base
}

export function sanitizeRelayHints(hints?: string[]): string[] {
  if (!Array.isArray(hints) || hints.length === 0) return []

  const normalizedAllowlist = new Set(
    RELAY_ALLOWLIST.map((u) => {
      try {
        const url = new URL(u)
        return normalizeRelayUrl(url)
      } catch {
        return null
      }
    }).filter(Boolean) as string[]
  )

  const safe = hints
    .map((hint) => (typeof hint === "string" ? hint.trim() : ""))
    .filter(Boolean)
    .map((hint) => {
      try {
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(hint)
        const normalizedHint = hasScheme ? hint : `wss://${hint.replace(/^\/\//, "")}`
        const url = new URL(normalizedHint)
        return url
      } catch {
        return null
      }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => url.protocol === "wss:")
    .filter((url) => !isPrivateRelayHost(url.hostname))
    .map((url) => normalizeRelayUrl(url))
    .filter((url) => normalizedAllowlist.has(url))

  return unique(safe)
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
