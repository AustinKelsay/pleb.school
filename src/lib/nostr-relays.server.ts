import { isIP as nodeIsIP } from "node:net"
import { normalizeRelayUrl, RELAY_ALLOWLIST, unique } from "./nostr-relays"

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  )
}

function isPrivateRelayHost(host: string): boolean {
  const lower = host.toLowerCase()
  if (
    lower === "localhost" ||
    lower === "local" ||
    lower === "ip6-localhost" ||
    lower === "::" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".home.arpa") ||
    lower.endsWith(".internal")
  ) {
    return true
  }

  const ipVersion = nodeIsIP(host)
  if (ipVersion === 4) {
    return isPrivateIPv4(host)
  }

  if (ipVersion === 6) {
    const mappedMatch = lower.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    if (mappedMatch && isPrivateIPv4(mappedMatch[1])) {
      return true
    }
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")
  }

  return false
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

export { DEFAULT_RELAYS, getRelays, type RelaySet } from "./nostr-relays"
