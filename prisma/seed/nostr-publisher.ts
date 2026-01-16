/**
 * Nostr Publisher for Seed Data
 *
 * Handles creating and publishing Nostr events for seed content.
 * Uses the same event structures as the main publish-service but
 * simplified for seed data generation.
 *
 * IMPORTANT: Set SEED_DRY_RUN=true to skip actual relay publishing.
 * This is useful for testing the seed script without publishing real events.
 */

import {
  RelayPool,
  createAddressableEvent,
  getEventHash,
  signEvent,
  getPublicKey,
  type NostrEvent,
} from 'snstr'
import { PUBLISH_RELAYS, RELAY_TIMEOUT } from './config'

/**
 * Check if we're in dry run mode (no actual publishing to relays)
 */
export function isDryRun(): boolean {
  return process.env.SEED_DRY_RUN === 'true' || process.env.SEED_DRY_RUN === '1'
}

// Event kinds for different content types (from NIP-01, NIP-23, NIP-51, NIP-99)
export const EVENT_KINDS = {
  PROFILE: 0, // NIP-01 (user profile metadata)
  LONG_FORM_CONTENT: 30023, // NIP-23 (free resources)
  CLASSIFIED_LISTING: 30402, // NIP-99 (paid resources)
  CURATION_SET: 30004, // NIP-51 (course lists)
} as const

export interface PublishResult {
  event: NostrEvent
  publishedRelays: string[]
  failedRelays: string[]
}

export interface ProfileEventParams {
  privkey: string
  name: string
  about: string
  picture?: string | null
  banner?: string | null
  nip05?: string | null
  lud16?: string | null
}

export interface ResourceEventParams {
  privkey: string
  dTag: string
  title: string
  summary: string
  content: string
  image?: string | null
  price: number
  topics: string[]
  type: 'document' | 'video'
  videoUrl?: string | null
}

export interface CourseEventParams {
  privkey: string
  dTag: string
  title: string
  description: string
  image?: string | null
  price: number
  topics: string[]
  lessonReferences: Array<{
    kind: number
    pubkey: string
    dTag: string
  }>
}

/**
 * Escape HTML special characters for safe embedding
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

/**
 * Sanitize a URL for safe use in markdown links.
 * Validates protocol and escapes markdown-breaking characters.
 */
function sanitizeUrlForMarkdown(url: string): string | null {
  const trimmed = url.trim()

  // Parse and validate URL
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  // Only allow http/https protocols (block javascript:, data:, etc.)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  // Use the parsed URL's href (normalized) and escape markdown-breaking characters
  // Parentheses and brackets can break markdown link syntax
  return parsed.href
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
}

/**
 * Build video embed HTML for YouTube videos
 */
function buildVideoEmbedHtml(originalUrl: string, title: string): string {
  const sanitizedTitle = escapeHtml(title)
  const trimmedUrl = originalUrl.trim()

  // YouTube pattern
  const youtubeMatch = trimmedUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
  )
  if (youtubeMatch) {
    const videoId = youtubeMatch[1]
    const embedUrl = `https://www.youtube.com/embed/${videoId}`
    return [
      '<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 12px 24px rgba(15,23,42,0.25);">',
      `<iframe src="${embedUrl}" title="${sanitizedTitle}" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
      '</div>',
    ].join('\n')
  }

  // Fallback to a simple link with sanitized URL
  const sanitizedUrl = sanitizeUrlForMarkdown(trimmedUrl)
  if (!sanitizedUrl) {
    // Invalid or unsafe URL - return plain text instead of a link
    return `> Video URL: ${sanitizedTitle}`
  }
  return `> Watch the video here: [${sanitizedTitle}](${sanitizedUrl})`
}

/**
 * Format content for video resources (prepend embed HTML)
 */
function formatVideoContent(title: string, videoUrl: string | null | undefined, body: string): string {
  const sections: string[] = [`# ${title}`]

  if (videoUrl) {
    sections.push('', buildVideoEmbedHtml(videoUrl, title))
  }

  if (body && body.trim()) {
    sections.push('', body)
  }

  return sections.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Create and sign a profile event (NIP-01 kind 0)
 *
 * Profile events contain user metadata as JSON in the content field.
 * Fields: name, about, picture, banner, nip05, lud16
 */
export async function createProfileEvent(params: ProfileEventParams): Promise<NostrEvent> {
  const { privkey, name, about, picture, banner, nip05, lud16 } = params

  // Build profile content object (only include non-null fields)
  const profileContent: Record<string, string> = {
    name,
    about,
  }

  if (picture) profileContent.picture = picture
  if (banner) profileContent.banner = banner
  if (nip05) profileContent.nip05 = nip05
  if (lud16) profileContent.lud16 = lud16

  // Derive pubkey from privkey
  const pubkey = getPublicKey(privkey)

  // Create unsigned event
  const unsignedEvent = {
    kind: EVENT_KINDS.PROFILE,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(profileContent),
  }

  // Hash and sign the event
  const id = await getEventHash(unsignedEvent)
  const sig = await signEvent(id, privkey)

  return {
    ...unsignedEvent,
    id,
    sig,
  } as NostrEvent
}

/**
 * Create and sign a resource event (NIP-23 or NIP-99)
 */
export async function createResourceEvent(params: ResourceEventParams): Promise<NostrEvent> {
  const {
    privkey,
    dTag,
    title,
    summary,
    content,
    image,
    price,
    topics,
    type,
    videoUrl,
  } = params

  const isPaid = price > 0
  const kind = isPaid ? EVENT_KINDS.CLASSIFIED_LISTING : EVENT_KINDS.LONG_FORM_CONTENT

  // Format content for video type
  const formattedContent =
    type === 'video' ? formatVideoContent(title, videoUrl, content) : content

  // Build additional tags array (d-tag is handled by createAddressableEvent)
  const additionalTags: string[][] = [
    ['title', title],
    ['summary', summary],
    ['published_at', Math.floor(Date.now() / 1000).toString()],
  ]

  if (image) {
    additionalTags.push(['image', image])
  }

  if (isPaid) {
    additionalTags.push(['price', price.toString(), 'SATS'])
  }

  // Add topics as 't' tags
  topics.forEach(topic => {
    additionalTags.push(['t', topic.toLowerCase()])
  })

  // Add content type as 't' tag
  additionalTags.push(['t', type])

  // Add video URL if present
  if (type === 'video' && videoUrl) {
    additionalTags.push(['video', videoUrl])
  }

  // Create unsigned addressable event (derives pubkey from privkey)
  const unsignedEvent = createAddressableEvent(
    kind,
    dTag,
    formattedContent,
    privkey,
    additionalTags
  )

  // Hash and sign the event
  const id = await getEventHash(unsignedEvent)
  const sig = await signEvent(id, privkey)

  return {
    ...unsignedEvent,
    id,
    sig,
  } as NostrEvent
}

/**
 * Create and sign a course event (NIP-51 curation set)
 */
export async function createCourseEvent(params: CourseEventParams): Promise<NostrEvent> {
  const {
    privkey,
    dTag,
    title,
    description,
    image,
    price,
    topics,
    lessonReferences,
  } = params

  // Build additional tags array (d-tag is handled by createAddressableEvent)
  const additionalTags: string[][] = [
    ['name', title],
    ['about', description],
    ['published_at', Math.floor(Date.now() / 1000).toString()],
  ]

  if (image) {
    additionalTags.push(['image', image])
  }

  if (price > 0) {
    additionalTags.push(['price', price.toString(), 'SATS'])
  }

  // Add topics as 't' tags
  topics.forEach(topic => {
    additionalTags.push(['t', topic.toLowerCase()])
  })

  // Add course type tag
  additionalTags.push(['t', 'course'])

  // Add lesson references as 'a' tags
  // Format: ["a", "<kind>:<pubkey>:<d-tag>"]
  lessonReferences.forEach(lesson => {
    additionalTags.push(['a', `${lesson.kind}:${lesson.pubkey}:${lesson.dTag}`])
  })

  // Create unsigned addressable event
  // Note: NIP-51 lists typically have empty content, but snstr requires non-empty
  // Using a single space as minimal content
  const unsignedEvent = createAddressableEvent(
    EVENT_KINDS.CURATION_SET,
    dTag,
    ' ', // Minimal content for course lists
    privkey,
    additionalTags
  )

  // Hash and sign the event
  const id = await getEventHash(unsignedEvent)
  const sig = await signEvent(id, privkey)

  return {
    ...unsignedEvent,
    id,
    sig,
  } as NostrEvent
}

/**
 * Publish an event to relays
 *
 * If SEED_DRY_RUN=true, this will skip actual publishing and return
 * a simulated success result. Useful for testing without publishing.
 */
export async function publishEvent(
  event: NostrEvent,
  relays: string[] = PUBLISH_RELAYS,
  options: { forceDryRun?: boolean } = {}
): Promise<PublishResult> {
  const dryRun = options.forceDryRun ?? isDryRun()

  // In dry run mode, simulate successful publishing
  if (dryRun) {
    return {
      event,
      publishedRelays: ['(dry-run)'],
      failedRelays: [],
    }
  }

  const pool = new RelayPool(relays)

  const publishedRelays: string[] = []
  const failedRelays: string[] = []

  try {
    const publishPromises = pool.publish(relays, event)
    const results = await Promise.race([
      Promise.allSettled(publishPromises),
      new Promise<PromiseSettledResult<void>[]>(resolve =>
        setTimeout(() => resolve(relays.map(() => ({ status: 'rejected' as const, reason: 'timeout' }))), RELAY_TIMEOUT)
      ),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        publishedRelays.push(relays[index])
      } else {
        failedRelays.push(relays[index])
      }
    })
  } catch (error) {
    console.error('Error publishing event:', error)
    failedRelays.push(...relays)
  } finally {
    await pool.close()
  }

  return { event, publishedRelays, failedRelays }
}

/**
 * Batch publish multiple events
 */
export async function publishEvents(
  events: NostrEvent[],
  relays: string[] = PUBLISH_RELAYS,
  options: { forceDryRun?: boolean } = {}
): Promise<PublishResult[]> {
  const results: PublishResult[] = []

  // Publish events sequentially to avoid overwhelming relays
  for (const event of events) {
    const result = await publishEvent(event, relays, options)
    results.push(result)

    // Small delay between publishes (skip in dry run for faster execution)
    if (!options.forceDryRun && !isDryRun()) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}
