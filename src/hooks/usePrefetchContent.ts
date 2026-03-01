/**
 * Hook to prefetch content data for faster perceived loading
 * Uses TanStack Query's prefetching capabilities
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSnstrContext } from '@/contexts/snstr-context'
import { useSession } from '@/hooks/useSession'
import { fetchCoursesWithNotes, coursesQueryKeys, getCourseViewerKey } from './useCoursesQuery'
import { fetchResourcesList, resourcesListQueryKeys } from './useResourcesListQuery'
import logger from '@/lib/logger'

interface UsePrefetchContentOptions {
  enabled?: boolean
  prefetchCourses?: boolean
  prefetchResources?: boolean
  /** @deprecated Use prefetchResources instead. */
  prefetchVideos?: boolean
  /** @deprecated Use prefetchResources instead. */
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
    prefetchResources,
    prefetchVideos = true,
    prefetchDocuments = true,
  } = options
  const shouldPrefetchResources = prefetchResources ?? (prefetchVideos || prefetchDocuments)

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

      // Prefetch the shared resource list once for resource sections.
      if (shouldPrefetchResources) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: resourcesListQueryKeys.list(false),
            queryFn: () => fetchResourcesList(),
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
  }, [enabled, prefetchCourses, shouldPrefetchResources, queryClient, relayPool, relays])
}

/**
 * Hook to prefetch a specific course by ID
 * Useful for hovering over course links or anticipating navigation
 */
export function usePrefetchCourse(courseId: string | undefined) {
  const queryClient = useQueryClient()
  const { relayPool, relays } = useSnstrContext()
  const { data: session, status } = useSession()
  const viewerKey = getCourseViewerKey(status, session?.user?.id)

  useEffect(() => {
    if (!courseId) return

    const prefetch = async () => {
      const { fetchCourseWithLessons, coursesQueryKeys } = await import('./useCoursesQuery')
      
      await queryClient.prefetchQuery({
        queryKey: coursesQueryKeys.detailForViewer(courseId, viewerKey),
        queryFn: () => fetchCourseWithLessons(courseId, relayPool, relays),
        staleTime: 10 * 60 * 1000, // 10 minutes
      })
    }

    prefetch().catch(() => {
      // Silently fail - prefetching errors shouldn't affect the user experience
    })
  }, [courseId, queryClient, relayPool, relays, viewerKey])
}
