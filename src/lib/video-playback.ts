export type VideoProvider = "youtube" | "vimeo" | "direct" | "unknown"

export const ALLOWED_SKIP_SECONDS = [10, 15] as const
export type SkipSeconds = (typeof ALLOWED_SKIP_SECONDS)[number]

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
  const minClamped = Math.max(0, targetSeconds)
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

  const directPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const pattern of directPatterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0]
      return id || null
    }
    if (parsed.hostname.includes("youtube.com")) {
      const queryId = parsed.searchParams.get("v")
      if (queryId) return queryId
      const pathParts = parsed.pathname.split("/").filter(Boolean)
      const embedIndex = pathParts.findIndex(part => part === "embed")
      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1]
      }
    }
  } catch {
    return null
  }

  return null
}

/**
 * Extract Vimeo video ID from URL.
 */
export function extractVimeoId(url: string): string | null {
  if (!url) return null

  const patterns = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("vimeo.com")) {
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
  const lower = url.toLowerCase()
  if (directExtensions.some(ext => lower.includes(ext))) {
    return "direct"
  }

  return "unknown"
}

/**
 * Check whether the raw content contains an embedded video tag.
 */
export function isEmbeddedVideo(content: string | undefined): boolean {
  if (!content) return false
  return content.includes("<video") || content.includes("<iframe")
}

/**
 * Extract fallback source URL from embedded content.
 */
export function extractVideoSource(content: string | undefined): string | null {
  if (!content) return null

  const sourceMatch = content.match(/src="([^"]+\.(mp4|webm|mov|avi|m3u8))"/i)
  if (sourceMatch?.[1]) return sourceMatch[1]

  const youtubeMatch = content.match(/src="[^"]*youtube\.com\/embed\/([^"?]+)/i)
  if (youtubeMatch?.[1]) return `https://www.youtube.com/watch?v=${youtubeMatch[1]}`

  const vimeoMatch = content.match(/src="[^"]*player\.vimeo\.com\/video\/(\d+)/i)
  if (vimeoMatch?.[1]) return `https://vimeo.com/${vimeoMatch[1]}`

  return null
}

/**
 * Ignore keyboard shortcuts when typing in editable elements.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tagName = target.tagName.toLowerCase()
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true
  }

  return Boolean(target.closest("[contenteditable='true']"))
}
