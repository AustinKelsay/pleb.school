/**
 * Hook to prefetch content data for faster perceived loading
 * Uses TanStack Query's prefetching capabilities
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSnstrContext } from '@/contexts/snstr-context'
import { fetchCoursesWithNotes, coursesQueryKeys } from './useCoursesQuery'
import { fetchResourceNotesBatch, resourceNotesQueryKeys } from './useResourceNotes'
import { fetchVideoResources, videosQueryKeys } from './useVideosQuery'
import { fetchDocumentResources, documentsQueryKeys } from './useDocumentsQuery'
import logger from '@/lib/logger'

interface UsePrefetchContentOptions {
  enabled?: boolean
  prefetchCourses?: boolean
  prefetchVideos?: boolean
  prefetchDocuments?: boolean
}

/**
 * Prefetch content data when the app loads or when a page is about to be visited
 * This runs in the background without blocking the UI
 */
export function usePrefetchContent(options: UsePrefetchContentOptions = {}) {
  const {
    enabled = true,
    prefetchCourses = true,
    prefetchVideos = true,
    prefetchDocuments = true,
  } = options

  const queryClient = useQueryClient()
  const { relayPool, relays } = useSnstrContext()

  useEffect(() => {
    if (!enabled) return

    const prefetchData = async () => {
      const promises: Promise<void>[] = []

      // Prefetch courses
      if (prefetchCourses) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: coursesQueryKeys.lists(),
            queryFn: () => fetchCoursesWithNotes(relayPool, relays),
            staleTime: 10 * 60 * 1000, // 10 minutes
          })
        )
      }

      // Prefetch video resources
      if (prefetchVideos) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: videosQueryKeys.lists(),
            queryFn: () => fetchVideoResources(),
            staleTime: 10 * 60 * 1000, // 10 minutes
          })
        )
      }

      // Prefetch document resources
      if (prefetchDocuments) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: documentsQueryKeys.lists(),
            queryFn: () => fetchDocumentResources(),
            staleTime: 10 * 60 * 1000, // 10 minutes
          })
        )
      }

      // Run all prefetches in parallel
      try {
        await Promise.allSettled(promises)
      } catch (error) {
        // Silently fail - prefetching errors shouldn't affect the user experience
        logger.debug('[Prefetch] Some content failed to prefetch', { error })
      }
    }

    // Delay prefetching slightly to prioritize initial page load
    const timeoutId = setTimeout(prefetchData, 1000)

    return () => clearTimeout(timeoutId)
  }, [enabled, prefetchCourses, prefetchVideos, prefetchDocuments, queryClient, relayPool, relays])
}

/**
 * Hook to prefetch a specific course by ID
 * Useful for hovering over course links or anticipating navigation
 */
export function usePrefetchCourse(courseId: string | undefined) {
  const queryClient = useQueryClient()
  const { relayPool, relays } = useSnstrContext()

  useEffect(() => {
    if (!courseId) return

    const prefetch = async () => {
      const { fetchCourseWithLessons, coursesQueryKeys } = await import('./useCoursesQuery')
      
      await queryClient.prefetchQuery({
        queryKey: coursesQueryKeys.detail(courseId),
        queryFn: () => fetchCourseWithLessons(courseId, relayPool, relays),
        staleTime: 10 * 60 * 1000, // 10 minutes
      })
    }

    prefetch().catch(() => {
      // Silently fail - prefetching errors shouldn't affect the user experience
    })
  }, [courseId, queryClient, relayPool, relays])
}
