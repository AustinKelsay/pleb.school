export type VideoProvider = "youtube" | "vimeo" | "direct" | "unknown"

export const ALLOWED_SKIP_SECONDS = [10, 15] as const
export type SkipSeconds = (typeof ALLOWED_SKIP_SECONDS)[number]

function isYouTubeShortHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === "youtu.be" || normalized === "www.youtu.be"
}

function isYouTubeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "youtube.com" ||
    normalized.endsWith(".youtube.com") ||
    normalized === "youtube-nocookie.com" ||
    normalized.endsWith(".youtube-nocookie.com")
  )
}

/**
 * Normalize configured skip seconds to the supported values.
 */
export function normalizeSkipSeconds(value: number | null | undefined): SkipSeconds {
  return value === 15 ? 15 : 10
}

/**
 * Clamp a seek target to [0, duration] when duration is known.
 */
export function clampSeekTarget(targetSeconds: number, durationSeconds?: number | null): number {
  const safeTarget = Number.isFinite(targetSeconds) ? targetSeconds : 0
  const minClamped = Math.max(0, safeTarget)
  if (!Number.isFinite(durationSeconds) || (durationSeconds ?? 0) <= 0) {
    return minClamped
  }

  return Math.min(minClamped, durationSeconds as number)
}

/**
 * Extract YouTube video ID from common URL shapes.
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (isYouTubeShortHostname(parsed.hostname)) {
      const id = parsed.pathname.split("/").filter(Boolean)[0]
      return id || null
    }
    if (isYouTubeHostname(parsed.hostname)) {
      const queryId = parsed.searchParams.get("v")
      if (queryId) return queryId
      const pathParts = parsed.pathname.split("/").filter(Boolean)
      const embedIndex = pathParts.findIndex(part => part === "embed")
      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1]
      }
      const shortsIndex = pathParts.findIndex(part => part === "shorts")
      if (shortsIndex >= 0 && pathParts[shortsIndex + 1]) {
        return pathParts[shortsIndex + 1]
      }
      const vIndex = pathParts.findIndex(part => part === "v")
      if (vIndex >= 0 && pathParts[vIndex + 1]) {
        return pathParts[vIndex + 1]
      }
    }
  } catch {
    // Ignore parse errors and continue with pattern fallback below.
  }

  const directPatterns = [
    /(?:^|\/\/)(?:[\w-]+\.)?youtu\.be\/([^&\n?#/]+)/i,
    /(?:^|\/\/)(?:[\w-]+\.)?youtube(?:-nocookie)?\.com\/watch\?v=([^&\n?#/]+)/i,
    /(?:^|\/\/)(?:[\w-]+\.)?youtube(?:-nocookie)?\.com\/embed\/([^&\n?#/]+)/i,
    /(?:^|\/\/)(?:[\w-]+\.)?youtube(?:-nocookie)?\.com\/v\/([^&\n?#/]+)/i,
    /(?:^|\/\/)(?:[\w-]+\.)?youtube(?:-nocookie)?\.com\/shorts\/([^&\n?#/]+)/i,
  ]
  for (const pattern of directPatterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * Extract Vimeo video ID from URL.
 */
export function extractVimeoId(url: string): string | null {
  if (!url) return null

  const patterns = [
    /(?:^|\/\/)(?:www\.)?vimeo\.com\/(\d+)/i,
    /(?:^|\/\/)player\.vimeo\.com\/video\/(\d+)/i,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  try {
    const parsed = new URL(url)
    const normalizedHostname = parsed.hostname.toLowerCase()
    if (normalizedHostname === "vimeo.com" || normalizedHostname.endsWith(".vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).find(part => /^\d+$/.test(part))
      return id || null
    }
  } catch {
    return null
  }

  return null
}

/**
 * Determine provider type from URL.
 */
export function getVideoProvider(url: string): VideoProvider {
  if (!url) return "unknown"

  if (extractYouTubeId(url)) {
    return "youtube"
  }

  if (extractVimeoId(url)) {
    return "vimeo"
  }

  const directExtensions = [".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv", ".m3u8"]
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()
    if (directExtensions.some(ext => pathname.endsWith(ext))) {
      return "direct"
    }
  } catch {
    const pathname = url.split(/[?#]/, 1)[0].toLowerCase()
    if (directExtensions.some(ext => pathname.endsWith(ext))) {
      return "direct"
    }
  }

  return "unknown"
}

/**
 * Check whether the raw content contains an embedded video tag.
 */
export function isEmbeddedVideo(content: string | undefined): boolean {
  if (!content) return false
  return /<\s*(video|iframe)\b/i.test(content)
}

/**
 * Extract fallback source URL from embedded content.
 */
export function extractVideoSource(content: string | undefined): string | null {
  if (!content) return null

  const sourceMatch = content.match(
    /src\s*=\s*(?:'|")([^"']+\.(?:mp4|webm|ogg|mov|avi|mkv|m3u8)(?:[?#][^"']*)?)(?:'|")/i
  )
  if (sourceMatch?.[1]) return sourceMatch[1]

  const youtubeMatch = content.match(
    /src\s*=\s*(["'])(?:https?:)?\/\/(?:[\w-]+\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|v\/|shorts\/)|youtu\.be\/)([^"'&#?/]+)(?:[^"']*)\1/i
  )
  if (youtubeMatch?.[2]) return `https://www.youtube.com/watch?v=${youtubeMatch[2]}`

  const vimeoMatch = content.match(
    /src\s*=\s*(["'])(?:https?:)?\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[^"']*)\1/i
  )
  if (vimeoMatch?.[2]) return `https://vimeo.com/${vimeoMatch[2]}`

  return null
}

/**
 * Ignore keyboard shortcuts when typing in editable elements.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const HTMLElementCtor = globalThis.HTMLElement
  if (typeof HTMLElementCtor === "undefined") return false
  if (!(target instanceof HTMLElementCtor)) return false
  if (target.isContentEditable) return true

  const tagName = target.tagName.toLowerCase()
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true
  }

  return Boolean(target.closest("[contenteditable='true']"))
}
