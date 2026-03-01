/**
 * TanStack Query hook for fetching document resources with their associated Nostr notes
 * Combines data from fake DB and Nostr network with intelligent caching
 * Filters resources by document type using Nostr note tags
 */

import { PaginationOptions } from '@/lib/db-adapter'
import { Resource } from '@/data/types'
import { useResourceNotes, filterNotesByContentType } from './useResourceNotes'
import { NostrEvent } from 'snstr'
import { fetchResourcesList, useResourcesListQuery } from './useResourcesListQuery'

// Types for enhanced document resource data
export interface DocumentResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

export interface DocumentsQueryResult {
  documents: DocumentResourceWithNote[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Options for the hook
interface DocumentPaginationOptions extends PaginationOptions {
  /**
   * When true, include resources that already belong to a course lesson.
   * Defaults to false so public listings only show standalone resources.
   */
  includeLessonResources?: boolean
}

export interface UseDocumentsQueryOptions extends DocumentPaginationOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
  select?: (data: DocumentResourceWithNote[]) => DocumentResourceWithNote[]
}

/**
 * Fetch document resources using unified resource notes fetching
 * Now leverages shared caching and deduplication via useResourceNotes
 */
export async function fetchDocumentResources(options?: DocumentPaginationOptions): Promise<{ 
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
 * Main hook for fetching document resources with their Nostr notes
 * Now uses unified resource fetching for better efficiency
 */
export function useDocumentsQuery(options: UseDocumentsQueryOptions = {}): DocumentsQueryResult {
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

  // Filter notes to only include documents
  const documentNotes = filterNotesByContentType(notesQuery.notes, 'document')

  // Combine resources with their notes, filtering for documents only
  const documentsWithNotes: DocumentResourceWithNote[] = resources
    .map(resource => {
      const noteResult = documentNotes.get(resource.id)
      if (!noteResult) return null // Not a document

      return {
        ...resource,
        note: noteResult.note,
        noteError: noteResult.noteError,
      }
    })
    .filter(resource => resource !== null) as DocumentResourceWithNote[]

  // Apply select transformation if provided
  const finalData = select ? select(documentsWithNotes) : documentsWithNotes

  const isLoading = resourcesQuery.isLoading || notesQuery.isLoading
  const isError = resourcesQuery.isError || notesQuery.isError
  const error = resourcesQuery.error || notesQuery.error

  return {
    documents: finalData,
    isLoading,
    isError,
    error,
    pagination: resourcesQuery.data?.pagination,
    refetch: () => {
      resourcesQuery.refetch()
      notesQuery.refetch()
    },
  }
}
