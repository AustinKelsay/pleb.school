/**
 * Unified hook for fetching resource notes with deduplication and caching
 * Eliminates redundant queries across multiple hooks by providing a shared cache
 */

import { useQuery } from "@tanstack/react-query"
import { NostrEvent, RelayPool } from "snstr"
import { useSnstrContext } from "@/contexts/snstr-context"
import logger from "@/lib/logger"

// Types for enhanced resource note data
export interface ResourceNoteResult {
  note?: NostrEvent
  noteError?: string
}

export interface ResourceNotesQueryResult {
  notes: Map<string, ResourceNoteResult>
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

// Query keys factory for better cache management
export const resourceNotesQueryKeys = {
  all: ["resource-notes"] as const,
  batch: (resourceIds: string[]) => [...resourceNotesQueryKeys.all, "batch", resourceIds.sort().join(",")] as const,
}

// Options for the hook
export interface UseResourceNotesOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
}

/**
 * Fetch resource notes in batch with deduplication
 * This is the core function that prevents redundant network requests
 */
export async function fetchResourceNotesBatch(
  resourceIds: string[],
  relayPool: RelayPool,
  relays: string[]
): Promise<Map<string, ResourceNoteResult>> {
  const results = new Map<string, ResourceNoteResult>()
  
  // Filter out empty resource IDs
  const validResourceIds = resourceIds.filter(id => id && id.length > 0)
  
  if (validResourceIds.length === 0) {
    return results
  }

  logger.debug("[ResourceNotes] Fetching resource notes batch", { count: validResourceIds.length })

  try {
    const notes = await relayPool.querySync(
      relays,
      { "#d": validResourceIds, kinds: [30023, 30402, 30403] }, // All content types
      { timeout: 5000 } // Reduced timeout for faster failures
    )

    logger.debug("[ResourceNotes] Successfully fetched resource notes", { count: notes.length })

    // Create a map for O(1) lookup of notes by ID
    const notesMap = new Map<string, NostrEvent>()
    notes.forEach(note => {
      const dTag = note.tags.find(tag => tag[0] === "d")
      if (dTag && dTag[1]) {
        notesMap.set(dTag[1], note)
      }
    })

    // Build results map with all requested IDs
    validResourceIds.forEach(resourceId => {
      const note = notesMap.get(resourceId)
      results.set(resourceId, {
        note,
        noteError: !note ? "Note not found" : undefined,
      })
    })

    return results
  } catch (error) {
    console.error("[ResourceNotes] Failed to fetch resource notes in batch:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch notes"
    
    // Set error for all requested IDs
    validResourceIds.forEach(resourceId => {
      results.set(resourceId, {
        noteError: errorMessage,
      })
    })

    return results
  }
}

/**
 * Hook for fetching multiple resource notes with automatic deduplication
 * This replaces individual queries in useVideosQuery, useDocumentsQuery, etc.
 */
export function useResourceNotes(
  resourceIds: string[],
  options: UseResourceNotesOptions = {}
): ResourceNotesQueryResult {
  const { relayPool, relays } = useSnstrContext()
  
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 10 minutes - increased for less frequent refetches
    gcTime = 30 * 60 * 1000, // 30 minutes - keep data in cache longer
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
  } = options

  // Sort resource IDs for consistent cache keys
  const sortedResourceIds = [...resourceIds].sort()

  const query = useQuery({
    queryKey: resourceNotesQueryKeys.batch(sortedResourceIds),
    queryFn: () => fetchResourceNotesBatch(sortedResourceIds, relayPool, relays),
    enabled: enabled && sortedResourceIds.length > 0,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    notes: query.data || new Map(),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook for fetching a single resource note
 * Convenience wrapper around useResourceNotes for single resources
 */
export function useResourceNote(
  resourceId: string,
  options: UseResourceNotesOptions = {}
): {
  note?: NostrEvent
  noteError?: string
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
} {
  const result = useResourceNotes(resourceId ? [resourceId] : [], options)
  const noteResult = result.notes.get(resourceId)

  return {
    note: noteResult?.note,
    noteError: noteResult?.noteError,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  }
}

/**
 * Filter resource notes by content type
 * Helper function to replace the filtering logic in individual hooks
 */
export function filterNotesByContentType(
  notes: Map<string, ResourceNoteResult>,
  contentType: "video" | "document"
): Map<string, ResourceNoteResult> {
  const filtered = new Map<string, ResourceNoteResult>()
  
  notes.forEach((noteResult, resourceId) => {
    if (!noteResult.note?.tags) {
      return
    }
    
    const hasContentType = noteResult.note.tags.some(
      tag => tag[0] === "t" && tag[1] === contentType
    )
    
    if (hasContentType) {
      filtered.set(resourceId, noteResult)
    }
  })
  
  return filtered
}
