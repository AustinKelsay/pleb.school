/**
 * TanStack Query hook for fetching video resources with their associated Nostr notes
 * Combines data from fake DB and Nostr network with intelligent caching
 * Filters resources by video type using Nostr note tags
 */

import { PaginationOptions } from '@/lib/db-adapter'
import { Resource } from '@/data/types'
import { useResourceNotes, filterNotesByContentType } from './useResourceNotes'
import { NostrEvent } from 'snstr'
import { fetchResourcesList, useResourcesListQuery } from './useResourcesListQuery'

// Types for enhanced video resource data
export interface VideoResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

export interface VideosQueryResult {
  videos: VideoResourceWithNote[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<unknown[]>
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Query keys factory for better cache management
export const videosQueryKeys = {
  all: ['videos'] as const,
  lists: () => ['videos', 'list'] as const,
  list: (includeLessonResources = false) => (
    includeLessonResources
      ? [...videosQueryKeys.lists(), { includeLessonResources: true }] as const
      : videosQueryKeys.lists()
  ),
  listPaginated: (page: number, pageSize: number, includeLessonResources = false) => (
    includeLessonResources
      ? [...videosQueryKeys.lists(), { page, pageSize, includeLessonResources: true }] as const
      : [...videosQueryKeys.lists(), { page, pageSize }] as const
  ),
  details: () => [...videosQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...videosQueryKeys.details(), id] as const,
  notes: () => [...videosQueryKeys.all, 'notes'] as const,
  note: (noteId: string) => [...videosQueryKeys.notes(), noteId] as const,
}

// Options for the hook
interface VideoPaginationOptions extends PaginationOptions {
  /**
   * When true, include resources that already belong to a course lesson.
   * Defaults to false so public listings only show standalone resources.
   */
  includeLessonResources?: boolean
}

export interface UseVideosQueryOptions extends VideoPaginationOptions {
  // Pagination options
  page?: number
  pageSize?: number
  // Query options
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
  select?: (data: VideoResourceWithNote[]) => VideoResourceWithNote[]
}

/**
 * Fetch video resources using unified resource notes fetching
 * Now leverages shared caching and deduplication via useResourceNotes
 */
export async function fetchVideoResources(options?: VideoPaginationOptions): Promise<{ 
  resources: Resource[], 
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}> {
  return fetchResourcesList(options)
}

/**
 * Main hook for fetching video resources with their Nostr notes
 * Now uses unified resource fetching for better efficiency
 */
export function useVideosQuery(options: UseVideosQueryOptions = {}): VideosQueryResult {
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 10 minutes - increased for less frequent refetches
    gcTime = 30 * 60 * 1000, // 30 minutes - keep data in cache longer
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
    select,
    page,
    pageSize,
    includeLessonResources = false,
  } = options

  // First, fetch all resources (without notes)
  const resourcesQuery = useResourcesListQuery({
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
    page,
    pageSize,
    includeLessonResources,
  })

  // Extract resource IDs for note fetching
  const resources = resourcesQuery.data?.resources || []
  const resourceIds = resources.map(resource => resource.id)

  // Fetch notes using unified hook (this provides deduplication)
  const notesQuery = useResourceNotes(resourceIds, {
    enabled: enabled && resourceIds.length > 0,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  // Filter notes to only include videos
  const videoNotes = filterNotesByContentType(notesQuery.notes, 'video')

  // Combine resources with their notes, filtering for videos only
  const videosWithNotes: VideoResourceWithNote[] = resources
    .map(resource => {
      const noteResult = videoNotes.get(resource.id)
      if (!noteResult) return null // Not a video

      return {
        ...resource,
        note: noteResult.note,
        noteError: noteResult.noteError,
      }
    })
    .filter(resource => resource !== null) as VideoResourceWithNote[]

  // Apply select transformation if provided
  const finalData = select ? select(videosWithNotes) : videosWithNotes

  const isLoading = resourcesQuery.isLoading || notesQuery.isLoading
  const isError = resourcesQuery.isError || notesQuery.isError
  const error = resourcesQuery.error || notesQuery.error

  return {
    videos: finalData,
    isLoading,
    isError,
    error,
    pagination: resourcesQuery.data?.pagination,
    refetch: () =>
      Promise.all([resourcesQuery.refetch(), notesQuery.refetch()]),
  }
}
