import { formatLinkLabel } from '@/lib/link-label'
import type { AdditionalLink } from '@/types/additional-links'

type RawLink =
  | string
  | AdditionalLink
  | { url?: unknown; title?: unknown; href?: unknown; link?: unknown; label?: unknown }
  | null
  | undefined

/**
 * Sanitize a raw URL while preserving non-HTTP(S) schemes (mailto:, ftp:, nostr:, etc.).
 * - Rejects dangerous schemes like javascript: or data:
 * - Accepts any absolute URL with a protocol
 * - If protocol is missing, attempts to prepend https://
 */
function sanitizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return null
  }

  const tryParse = (candidate: string): string | null => {
    try {
      // URL requires a protocol; will throw if relative
      new URL(candidate)
      return candidate
    } catch {
      return null
    }
  }

  // If it already has a protocol, keep as-is (even non-http)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return tryParse(trimmed)
  }

  // Otherwise, attempt https:// prefix for bare domains
  return tryParse(`https://${trimmed}`)
}

/**
 * Normalize a single raw link value into an AdditionalLink, or null if invalid.
 * Accepts legacy string values or objects with url/title fields.
 */
export function normalizeAdditionalLink(raw: RawLink): AdditionalLink | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    const url = sanitizeUrl(raw)
    if (!url) return null
    return { url }
  }

  const candidate: any = raw
  const urlValue =
    (typeof candidate.url === 'string' && candidate.url) ||
    (typeof candidate.href === 'string' && candidate.href) ||
    (typeof candidate.link === 'string' && candidate.link)
  const titleValue =
    (typeof candidate.title === 'string' && candidate.title) ||
    (typeof candidate.label === 'string' && candidate.label)

  const url = typeof urlValue === 'string' ? sanitizeUrl(urlValue) : null
  const title = typeof titleValue === 'string' ? titleValue.trim() : undefined

  if (!url) return null

  return title ? { url, title } : { url }
}

/**
 * Normalize an array-like value into a clean AdditionalLink[].
 * - Filters out invalid entries
 * - Deduplicates by normalized URL
 */
export function normalizeAdditionalLinks(raw: unknown): AdditionalLink[] {
  if (!raw) return []

  const arrayValue = Array.isArray(raw) ? raw : []
  const normalized: AdditionalLink[] = []
  const seen = new Set<string>()

  for (const entry of arrayValue) {
    const link = normalizeAdditionalLink(entry)
    if (!link) continue

    const url = link.url.trim()
    const key = url.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    normalized.push({
      url,
      ...(link.title?.trim() ? { title: link.title.trim() } : {}),
    })
  }

  return normalized
}

/**
 * Convert a set of Nostr tags into AdditionalLink objects.
 * Uses the provided tag identifier (default 'r') and reads title from tag[2] when present.
 */
export function tagsToAdditionalLinks(tags: string[][] | undefined, tag = 'r'): AdditionalLink[] {
  if (!Array.isArray(tags)) return []

  const rawLinks = tags
    .filter(t => Array.isArray(t) && t[0] === tag && t[1])
    .map(t => ({
      url: t[1],
      title: t[2],
    }))

  return normalizeAdditionalLinks(rawLinks)
}

/**
 * Convert AdditionalLink objects to Nostr tags using the provided tag name (default 'r').
 */
export function additionalLinksToTags(links: AdditionalLink[] | undefined, tag = 'r'): string[][] {
  if (!links || links.length === 0) return []

  return normalizeAdditionalLinks(links).map(link => {
    const title = link.title?.trim()
    return title ? [tag, link.url.trim(), title] : [tag, link.url.trim()]
  })
}

/**
 * Get the label to render for a link, preferring the explicit title and
 * falling back to a domain-based label.
 */
export function additionalLinkLabel(link: AdditionalLink): string {
  const title = link.title?.trim()
  if (title) return title
  return formatLinkLabel(link.url)
}

/**
 * Extract a display-friendly base hostname (no protocol/www).
 */
export function additionalLinkHostname(link: AdditionalLink): string {
  try {
    const url = new URL(/^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`)
    return url.hostname.replace(/^www\./i, '')
  } catch {
    // Fallback to the raw host-ish portion
    return link.url.replace(/^https?:\/\//i, '').split('/')[0] || link.url
  }
}
