"use client"

import { usePrefetchContent } from '@/hooks/usePrefetchContent'

interface HomepageWithPrefetchProps {
  children: React.ReactNode
}

/**
 * Client wrapper component that prefetches content data in the background
 * This improves perceived performance by loading data before the user navigates
 */
export function HomepageWithPrefetch({ children }: HomepageWithPrefetchProps) {
  // Prefetch all content types after initial page load
  usePrefetchContent({
    prefetchCourses: true,
    prefetchResources: true,
  })

  return <>{children}</>
}
