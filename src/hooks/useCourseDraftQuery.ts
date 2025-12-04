/**
 * React Query hook for fetching a single course draft
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import type { AdditionalLink } from '@/types/additional-links'

export interface DraftLesson {
  id: string
  courseDraftId: string
  resourceId?: string | null
  draftId?: string | null
  index: number
  resource?: {
    id: string
    title?: string | null
    price?: number | null
    noteId?: string | null
    videoId?: string | null
    videoUrl?: string | null
    note?: {
      id: string
      content: string
      kind: number
      tags: string[][]
      created_at: number
      pubkey: string
      sig: string
    } | null
    user?: {
      id: string
      username?: string | null
      pubkey?: string | null
    }
  }
  draft?: {
    id: string
    title: string
    summary: string
    content: string
    type: string
    price?: number | null
    image?: string | null
    topics: string[]
    additionalLinks?: AdditionalLink[]
    videoUrl?: string | null
  }
}

export interface CourseDraft {
  id: string
  title: string
  summary: string
  image?: string
  price?: number
  topics: string[]
  createdAt: string
  updatedAt: string
  userId: string
  draftLessons: DraftLesson[]
  user?: {
    id: string
    username?: string | null
    email?: string | null
    pubkey?: string | null
  }
}

export interface CourseDraftQueryResult {
  data: CourseDraft | null | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Fetch a course draft by ID
 */
async function fetchCourseDraft(courseDraftId: string): Promise<CourseDraft> {
  const response = await fetch(`/api/drafts/courses/${courseDraftId}`)
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Course draft not found')
    }
    if (response.status === 403) {
      throw new Error('Access denied')
    }
    throw new Error('Failed to fetch course draft')
  }
  
  const result = await response.json()
  return result.data
}

/**
 * Hook for fetching a single course draft
 */
export function useCourseDraftQuery(courseDraftId: string): CourseDraftQueryResult {
  const { data: session, status: sessionStatus } = useSession()
  
  const query = useQuery({
    queryKey: ['drafts', 'courses', courseDraftId],
    queryFn: () => fetchCourseDraft(courseDraftId),
    enabled: !!courseDraftId && sessionStatus === 'authenticated',
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on 404 or 403
      if (error instanceof Error && 
          (error.message === 'Course draft not found' || error.message === 'Access denied')) {
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

/**
 * Delete a course draft
 */
async function deleteCourseDraft(courseDraftId: string): Promise<void> {
  const response = await fetch(`/api/drafts/courses/${courseDraftId}`, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Course draft not found')
    }
    if (response.status === 403) {
      throw new Error('Access denied')
    }
    throw new Error('Failed to delete course draft')
  }
}

/**
 * Hook for deleting a course draft
 * Provides mutation functions for deleting course drafts
 */
export function useDeleteCourseDraft() {
  const queryClient = useQueryClient()
  
  const mutation = useMutation({
    mutationFn: deleteCourseDraft,
    onSuccess: () => {
      // Invalidate drafts queries
      queryClient.invalidateQueries({ queryKey: ['drafts'] })
      queryClient.invalidateQueries({ queryKey: ['drafts', 'courses'] })
    }
  })

  return {
    deleteCourseDraft: mutation.mutate,
    deleteCourseDraftAsync: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  }
}
