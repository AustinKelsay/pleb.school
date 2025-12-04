/**
 * React Query hook for fetching a single resource draft
 */

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import type { AdditionalLink } from '@/types/additional-links'

export interface ResourceDraft {
  id: string
  type: string
  title: string
  summary: string
  content: string
  image?: string
  price?: number
  topics: string[]
  additionalLinks?: AdditionalLink[]
  videoUrl?: string
  createdAt: string
  updatedAt: string
  userId: string
}

export interface ResourceDraftQueryResult {
  data: ResourceDraft | null | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

interface UseResourceDraftQueryOptions {
  enabled?: boolean
}

/**
 * Fetch a resource draft by ID
 */
async function fetchResourceDraft(draftId: string): Promise<ResourceDraft> {
  const response = await fetch(`/api/drafts/resources/${draftId}`)
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Draft not found')
    }
    if (response.status === 403) {
      throw new Error('Access denied')
    }
    throw new Error('Failed to fetch draft')
  }
  
  const result = await response.json()
  return result.data
}

/**
 * Hook for fetching a single resource draft
 */
export function useResourceDraftQuery(
  draftId: string,
  options: UseResourceDraftQueryOptions = {}
): ResourceDraftQueryResult {
  const { data: session } = useSession()
  
  const query = useQuery({
    queryKey: ['drafts', 'resources', draftId],
    queryFn: () => fetchResourceDraft(draftId),
    enabled: !!draftId && !!session?.user?.id && (options.enabled ?? true),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on 404 or 403
      if (error instanceof Error && 
          (error.message === 'Draft not found' || error.message === 'Access denied')) {
        return false
      }
      return failureCount < 3
    }
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
