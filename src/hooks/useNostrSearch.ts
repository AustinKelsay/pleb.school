"use client";

import { useQuery } from '@tanstack/react-query'
import { useSnstrContext } from '@/contexts/snstr-context'
import { NostrEvent, RelayPool, decodePublicKey } from 'snstr'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { SearchResult } from '@/lib/search'
import { getRelays, type RelaySet } from '@/lib/nostr-relays'
import adminConfig from '../../config/admin.json'
import contentConfig from '../../config/content.json'

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

// Convert npub to hex format for Nostr author queries
function npubToHex(pubkey: string): string | null {
  try {
    if (pubkey.startsWith('npub1')) {
      return decodePublicKey(pubkey as `npub1${string}`)
    } else if (/^[a-f0-9]{64}$/i.test(pubkey)) {
      return pubkey.toLowerCase()
    }
  } catch (error) {
    console.error('Error converting pubkey:', error)
  }
  return null
}

// Get admin pubkeys as hex for Nostr author queries
function getAdminPubkeysHex(): string[] {
  const allPubkeys = [
    ...adminConfig.admins.pubkeys,
    ...adminConfig.moderators.pubkeys,
  ]

  return allPubkeys
    .map(npubToHex)
    .filter((hex): hex is string => hex !== null)
}

// Query keys factory for better cache management
export const nostrSearchQueryKeys = {
  all: ['nostr-search'] as const,
  searches: () => [...nostrSearchQueryKeys.all, 'search'] as const,
  search: (keyword: string) => [...nostrSearchQueryKeys.searches(), keyword] as const,
}

/**
 * Calculate match score based on keyword relevance
 */
function calculateMatchScore(keyword: string, title: string, description: string, content: string): number {
  const lowerKeyword = keyword.toLowerCase()
  const lowerTitle = title.toLowerCase()
  const lowerDescription = description.toLowerCase()
  const lowerContent = content.toLowerCase()
  
  let score = 0
  
  // Exact match in title (highest score)
  if (lowerTitle === lowerKeyword) {
    score += 100
  }
  // Title starts with keyword
  else if (lowerTitle.startsWith(lowerKeyword)) {
    score += 50
  }
  // Title contains keyword
  else if (lowerTitle.includes(lowerKeyword)) {
    score += 30
  }
  
  // Description contains keyword
  if (lowerDescription.includes(lowerKeyword)) {
    const matches = lowerDescription.match(new RegExp(lowerKeyword, 'g'))
    score += (matches?.length || 1) * 8
  }
  
  // Content contains keyword
  if (lowerContent.includes(lowerKeyword)) {
    const matches = lowerContent.match(new RegExp(lowerKeyword, 'g'))
    score += (matches?.length || 1) * 3
  }
  
  // Word boundary matches (whole word)
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
  
  return score
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
    
    // Skip if no searchable content
    if (!title && !description && !content) return null
    
    const score = calculateMatchScore(keyword, title, description, content)
    
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
    
    // Skip if no searchable content
    if (!title && !description && !content) return null
    
    const score = calculateMatchScore(keyword, title, description, content)
    
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
 * Queries content from admin/moderator pubkeys and filters by keyword client-side
 */
async function searchNostrContent(
  keyword: string,
  relayPool: RelayPool,
  relays: string[],
  config: SearchConfig
): Promise<SearchResult[]> {
  const searchRelays = resolveSearchRelays(config.relaySet, relays)

  if (!keyword || keyword.length < config.minKeywordLength) return []

  const adminPubkeys = getAdminPubkeysHex()

  if (adminPubkeys.length === 0) {
    console.warn('No admin pubkeys configured - search will return no results')
    return []
  }

  try {
    console.log(`Searching Nostr for keyword: "${keyword}" from ${adminPubkeys.length} admin author(s)`)

    // Fetch events from admin authors - this queries real content published by admins
    const events = await relayPool.querySync(
      searchRelays,
      {
        kinds: [30004, 30023, 30402],
        authors: adminPubkeys,
        limit: config.limit
      },
      { timeout: config.timeout }
    )

    console.log(`Found ${events.length} events from admin authors, filtering by keyword "${keyword}"`)

    // Use a Map to deduplicate results by ID (d tag value)
    const resultsMap = new Map<string, SearchResult>()

    // Process each event and do client-side keyword matching
    for (const event of events) {
      let searchResult: SearchResult | null = null

      if (event.kind === 30004) {
        // Course event
        searchResult = courseEventToSearchResult(event, keyword)
      } else if (event.kind === 30023 || event.kind === 30402) {
        // Resource event (free or paid)
        searchResult = resourceEventToSearchResult(event, keyword)
      }

      if (searchResult) {
        // Only keep the result with the highest match score for each ID
        const existingResult = resultsMap.get(searchResult.id)
        if (!existingResult || searchResult.matchScore > existingResult.matchScore) {
          resultsMap.set(searchResult.id, searchResult)
        }
      }
    }

    // Convert Map to array
    const deduplicatedResults = Array.from(resultsMap.values())

    console.log(`Processed ${deduplicatedResults.length} unique search results (${events.length - deduplicatedResults.length} duplicates removed)`)

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
 * - Searches content from admin/moderator pubkeys (configured in admin.json)
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
 * Also filters by admin pubkeys for content relevance
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

      const adminPubkeys = getAdminPubkeysHex()
      if (adminPubkeys.length === 0) return []

      try {
        const events = await relayPool.querySync(
          searchRelays,
          {
            kinds,
            authors: adminPubkeys,
            limit: config.limit
          },
          { timeout: config.timeout }
        )

        const results: SearchResult[] = []

        for (const event of events) {
          let searchResult: SearchResult | null = null

          if (event.kind === 30004) {
            searchResult = courseEventToSearchResult(event, keyword)
          } else if (event.kind === 30023 || event.kind === 30402) {
            searchResult = resourceEventToSearchResult(event, keyword)
          }

          if (searchResult) {
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
