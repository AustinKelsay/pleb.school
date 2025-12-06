"use client";

import { useQuery } from '@tanstack/react-query'
import { useSnstrContext } from '@/contexts/snstr-context'
import { NostrEvent, RelayPool } from 'snstr'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { SearchResult, MatchedField } from '@/lib/search'
import { getRelays, type RelaySet } from '@/lib/nostr-relays'
import { normalizeHexPubkey } from '@/lib/nostr-keys'
import contentConfig from '../../config/content.json'
import adminConfig from '../../config/admin.json'

// Options for the hook
export interface UseNostrSearchOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
}

// Result interface
export interface NostrSearchResult {
  results: SearchResult[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  isFetching: boolean
}

type SearchConfig = {
  timeout: number
  limit: number
  minKeywordLength: number
  relaySet?: RelaySet
}

type AdminPubkeyConfig = {
  admins?: { pubkeys?: string[] }
  moderators?: { pubkeys?: string[] }
}

function getAuthorizedSearchAuthors(): string[] {
  const { admins, moderators } = adminConfig as AdminPubkeyConfig
  const configuredPubkeys = [
    ...(admins?.pubkeys ?? []),
    ...(moderators?.pubkeys ?? [])
  ]

  const normalized = configuredPubkeys
    .map(normalizeHexPubkey)
    .filter((pubkey): pubkey is string => Boolean(pubkey))

  const unique = Array.from(new Set(normalized))

  if (unique.length === 0) {
    console.warn('Nostr search disabled: no admin/moderator pubkeys configured')
  }

  return unique
}

const AUTHORIZED_SEARCH_AUTHORS = getAuthorizedSearchAuthors()
const AUTHORIZED_SEARCH_AUTHOR_SET = new Set(AUTHORIZED_SEARCH_AUTHORS)

function isAuthorizedSearchAuthor(pubkey?: string): boolean {
  const normalized = normalizeHexPubkey(pubkey || '')
  return normalized ? AUTHORIZED_SEARCH_AUTHOR_SET.has(normalized) : false
}

// Get search config with defaults
function getSearchConfig(): SearchConfig {
  const searchConfig = (contentConfig as any).search || {}
  return {
    timeout: searchConfig.timeout ?? 15000,
    limit: searchConfig.limit ?? 100,
    minKeywordLength: searchConfig.minKeywordLength ?? 3,
    relaySet: searchConfig.relaySet as RelaySet | undefined,
  }
}

function resolveSearchRelays(relaySet: RelaySet | undefined, fallbackRelays: string[]): string[] {
  const configuredRelays = getRelays(relaySet ?? 'default')
  return configuredRelays.length ? configuredRelays : fallbackRelays
}

// Cache database IDs to avoid refetching on every keystroke
const DATABASE_ID_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let cachedDatabaseIds: string[] | null = null
let cachedDatabaseIdsTimestamp = 0
let inflightDatabaseIdsPromise: Promise<string[]> | null = null

/**
 * Fetch all content IDs from the database with simple in-memory caching.
 * This prevents multiple paginated requests on every search keystroke.
 */
async function fetchDatabaseContentIds(): Promise<string[]> {
  const now = Date.now()
  if (cachedDatabaseIds && now - cachedDatabaseIdsTimestamp < DATABASE_ID_CACHE_TTL_MS) {
    return cachedDatabaseIds
  }

  if (inflightDatabaseIdsPromise) {
    return inflightDatabaseIdsPromise
  }

  const PAGE_SIZE = 200
  const MAX_PAGES = 50

  const collectIds = async (
    baseUrl: string,
    dataKey: 'courses' | 'resources',
    extraParams = ''
  ): Promise<string[]> => {
    const ids: string[] = []
    let page = 1
    let hasNext = true

    while (hasNext && page <= MAX_PAGES) {
      const url = `${baseUrl}?page=${page}&pageSize=${PAGE_SIZE}${extraParams}`
      const res = await fetch(url)

      if (!res.ok) {
        console.error(`Failed to fetch ${dataKey} page ${page}`)
        break
      }

      const json = await res.json()
      const items = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json[dataKey])
          ? json[dataKey]
          : []

      ids.push(
        ...items
          .map((item: { id?: string }) => item.id)
          .filter((id: string | undefined): id is string => Boolean(id))
      )

      const pagination = json.pagination
      if (pagination && typeof pagination.hasNext === 'boolean') {
        hasNext = pagination.hasNext
      } else {
        hasNext = items.length === PAGE_SIZE
      }

      page += 1
    }

    return ids
  }

  inflightDatabaseIdsPromise = (async () => {
    try {
      const [courseIds, resourceIds] = await Promise.all([
        collectIds('/api/courses/list', 'courses'),
        collectIds('/api/resources/list', 'resources', '&includeLessonResources=true')
      ])

      cachedDatabaseIds = [...courseIds, ...resourceIds]
      cachedDatabaseIdsTimestamp = Date.now()
      return cachedDatabaseIds
    } catch (error) {
      console.error('Error fetching database content IDs:', error)
      return []
    } finally {
      inflightDatabaseIdsPromise = null
    }
  })()

  return inflightDatabaseIdsPromise
}

// Query keys factory for better cache management
export const nostrSearchQueryKeys = {
  all: ['nostr-search'] as const,
  searches: () => [...nostrSearchQueryKeys.all, 'search'] as const,
  search: (keyword: string) => [...nostrSearchQueryKeys.searches(), keyword] as const,
}

/**
 * Calculate match score based on keyword relevance
 * Returns both the score and which fields matched
 */
function calculateMatchScore(keyword: string, title: string, description: string, content: string, tags: string[]): { score: number; matchedFields: MatchedField[] } {
  const lowerKeyword = keyword.toLowerCase()
  const lowerTitle = title.toLowerCase()
  const lowerDescription = description.toLowerCase()
  const lowerContent = content.toLowerCase()

  let score = 0
  const matchedFields: MatchedField[] = []

  // Title matching
  if (lowerTitle.includes(lowerKeyword)) {
    matchedFields.push('title')
    if (lowerTitle === lowerKeyword) {
      score += 100  // Exact match
    } else if (lowerTitle.startsWith(lowerKeyword)) {
      score += 50  // Starts with
    } else {
      score += 30  // Contains
    }
  }

  // Description matching
  if (lowerDescription.includes(lowerKeyword)) {
    matchedFields.push('description')
    const matches = lowerDescription.match(new RegExp(lowerKeyword, 'g'))
    score += (matches?.length || 1) * 8
  }

  // Content matching
  if (lowerContent.includes(lowerKeyword)) {
    matchedFields.push('content')
    const matches = lowerContent.match(new RegExp(lowerKeyword, 'g'))
    score += (matches?.length || 1) * 3
  }

  // Tag matching
  let tagMatched = false
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase()
    if (lowerTag === lowerKeyword) {
      score += 40  // Exact tag match
      tagMatched = true
    } else if (lowerTag.includes(lowerKeyword)) {
      score += 20  // Partial tag match
      tagMatched = true
    }
  }
  if (tagMatched) {
    matchedFields.push('tags')
  }

  // Word boundary matches (whole word) - bonus points
  const wordBoundaryRegex = new RegExp(`\\b${lowerKeyword}\\b`, 'gi')
  if (wordBoundaryRegex.test(title)) {
    score += 25
  }
  if (wordBoundaryRegex.test(description)) {
    score += 15
  }
  if (wordBoundaryRegex.test(content)) {
    score += 5
  }

  return { score, matchedFields }
}

/**
 * Highlight matched keywords in text
 */
function highlightKeyword(text: string, keyword: string): string {
  if (!text || !keyword) return text
  
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Convert Nostr course event to SearchResult
 */
function courseEventToSearchResult(event: NostrEvent, keyword: string): SearchResult | null {
  try {
    const parsedEvent = parseCourseEvent(event)

    const title = parsedEvent.title || parsedEvent.name || ''
    const description = parsedEvent.description || ''
    const content = parsedEvent.content || ''
    const tags = parsedEvent.topics || []

    // Skip if no searchable content
    if (!title && !description && !content && tags.length === 0) return null

    const { score, matchedFields } = calculateMatchScore(keyword, title, description, content, tags)

    // Only include results with a score > 0
    if (score <= 0) return null

    return {
      id: parsedEvent.d || event.id,
      type: 'course',
      title,
      description,
      category: parsedEvent.topics[0] || 'general',
      instructor: event.pubkey,
      image: parsedEvent.image,
      rating: 0,
      price: 0, // Default price, real price comes from database
      isPremium: false,
      matchScore: score,
      keyword,
      tags: parsedEvent.topics || [],
      matchedFields,
      highlights: {
        title: highlightKeyword(title, keyword),
        description: highlightKeyword(description, keyword)
      }
    }
  } catch (error) {
    console.error('Error parsing course event:', error)
    return null
  }
}

/**
 * Convert Nostr resource event to SearchResult
 */
function resourceEventToSearchResult(event: NostrEvent, keyword: string): SearchResult | null {
  try {
    const parsedEvent = parseEvent(event)

    const title = parsedEvent.title || ''
    const description = parsedEvent.summary || ''
    const content = parsedEvent.content || ''
    const tags = parsedEvent.topics || []

    // Skip if no searchable content
    if (!title && !description && !content && tags.length === 0) return null

    const { score, matchedFields } = calculateMatchScore(keyword, title, description, content, tags)

    // Only include results with a score > 0
    if (score <= 0) return null

    return {
      id: parsedEvent.d || event.id,
      type: 'resource',
      title,
      description,
      category: parsedEvent.topics[0] || parsedEvent.type || 'general',
      instructor: parsedEvent.author || event.pubkey,
      image: parsedEvent.image,
      rating: 0,
      price: parsedEvent.price ? parseInt(parsedEvent.price) : 0,
      isPremium: (parsedEvent.price && parseInt(parsedEvent.price) > 0) || event.kind === 30402,
      matchScore: score,
      keyword,
      tags: parsedEvent.topics || [],
      matchedFields,
      highlights: {
        title: highlightKeyword(title, keyword),
        description: highlightKeyword(description, keyword)
      }
    }
  } catch (error) {
    console.error('Error parsing resource event:', error)
    return null
  }
}

/**
 * Search Nostr events for content matching keywords
 * Uses database-first approach: fetches IDs from database, then queries Nostr with those IDs
 */
async function searchNostrContent(
  keyword: string,
  relayPool: RelayPool,
  relays: string[],
  config: SearchConfig
): Promise<SearchResult[]> {
  const searchRelays = resolveSearchRelays(config.relaySet, relays)

  if (!keyword || keyword.length < config.minKeywordLength) return []
  if (AUTHORIZED_SEARCH_AUTHORS.length === 0) return []

  // Step 1: Get all content IDs from database
  const databaseIds = await fetchDatabaseContentIds()

  if (databaseIds.length === 0) {
    console.warn('No content found in database - search will return no results')
    return []
  }

  try {
    console.log(`Searching Nostr for keyword: "${keyword}" in ${databaseIds.length} database items`)

    // Step 2: Query Nostr using 'd' tags for only database-backed content
    const events = await relayPool.querySync(
      searchRelays,
      {
        kinds: [30004, 30023, 30402],
        "#d": databaseIds,
        authors: AUTHORIZED_SEARCH_AUTHORS,
        limit: config.limit
      },
      { timeout: config.timeout }
    )

    console.log(`Found ${events.length} events from Nostr, filtering by keyword "${keyword}"`)

    // Step 3: Client-side keyword matching
    const resultsMap = new Map<string, SearchResult>()

    for (const event of events) {
      if (!isAuthorizedSearchAuthor(event.pubkey)) continue

      let searchResult: SearchResult | null = null

      if (event.kind === 30004) {
        searchResult = courseEventToSearchResult(event, keyword)
      } else if (event.kind === 30023 || event.kind === 30402) {
        searchResult = resourceEventToSearchResult(event, keyword)
      }

      // Only include results with matchScore > 0 (keyword actually matches)
      if (searchResult && searchResult.matchScore > 0) {
        const existingResult = resultsMap.get(searchResult.id)
        if (!existingResult || searchResult.matchScore > existingResult.matchScore) {
          resultsMap.set(searchResult.id, searchResult)
        }
      }
    }

    const deduplicatedResults = Array.from(resultsMap.values())

    console.log(`Found ${deduplicatedResults.length} matching results for "${keyword}"`)

    // Sort by match score (highest first)
    deduplicatedResults.sort((a, b) => b.matchScore - a.matchScore)

    return deduplicatedResults

  } catch (error) {
    console.error('Error searching Nostr content:', error)
    throw new Error(`Failed to search Nostr content: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Hook for searching content on Nostr relays using React Query
 *
 * Features:
 * - Database-first approach: only searches content that exists in the database
 * - Searches course events (kind 30004) and resource events (kinds 30023, 30402)
 * - Uses existing parser functions for consistent data structure
 * - Returns results compatible with existing search UI
 * - Includes proper loading states and error handling
 * - Uses React Query for caching and state management
 * - Configurable via content.json search settings
 */
export function useNostrSearch(
  keyword: string,
  options: UseNostrSearchOptions = {}
): NostrSearchResult {
  const { relayPool, relays } = useSnstrContext()
  const config = getSearchConfig()
  const searchRelays = resolveSearchRelays(config.relaySet, relays)

  const {
    enabled = true,
    staleTime = 2 * 60 * 1000, // 2 minutes (shorter for search)
    gcTime = 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus = false,
    refetchOnMount = false,
    retry = 2,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: nostrSearchQueryKeys.search(keyword),
    queryFn: () => searchNostrContent(keyword, relayPool, searchRelays, config),
    enabled: enabled && keyword.length >= config.minKeywordLength,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    results: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  }
}

/**
 * Hook for searching specific event kinds on Nostr
 * Uses database-first approach: only searches content that exists in the database
 */
export function useNostrSearchByKind(
  keyword: string,
  kinds: number[],
  options: UseNostrSearchOptions = {}
): NostrSearchResult {
  const { relayPool, relays } = useSnstrContext()
  const config = getSearchConfig()
  const searchRelays = resolveSearchRelays(config.relaySet, relays)

  const {
    enabled = true,
    staleTime = 2 * 60 * 1000,
    gcTime = 5 * 60 * 1000,
    refetchOnWindowFocus = false,
    refetchOnMount = false,
    retry = 2,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: [...nostrSearchQueryKeys.search(keyword), kinds],
    queryFn: async () => {
      if (!keyword || keyword.length < config.minKeywordLength) return []
      if (AUTHORIZED_SEARCH_AUTHORS.length === 0) return []

      // Get database IDs first
      const databaseIds = await fetchDatabaseContentIds()
      if (databaseIds.length === 0) return []

      try {
        const events = await relayPool.querySync(
          searchRelays,
          {
            kinds,
            "#d": databaseIds,
            authors: AUTHORIZED_SEARCH_AUTHORS,
            limit: config.limit
          },
          { timeout: config.timeout }
        )

        const results: SearchResult[] = []

        for (const event of events) {
          if (!isAuthorizedSearchAuthor(event.pubkey)) continue

          let searchResult: SearchResult | null = null

          if (event.kind === 30004) {
            searchResult = courseEventToSearchResult(event, keyword)
          } else if (event.kind === 30023 || event.kind === 30402) {
            searchResult = resourceEventToSearchResult(event, keyword)
          }

          // Only include results with matchScore > 0
          if (searchResult && searchResult.matchScore > 0) {
            results.push(searchResult)
          }
        }

        return results.sort((a, b) => b.matchScore - a.matchScore)

      } catch (error) {
        console.error('Error searching Nostr by kind:', error)
        throw new Error(`Failed to search Nostr: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    },
    enabled: enabled && keyword.length >= config.minKeywordLength,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    results: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  }
}
