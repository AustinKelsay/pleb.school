"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"
import { isAnalyticsEnabled, trackEventSafe } from "@/lib/analytics"

export const PageViewTracker = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    if (!isAnalyticsEnabled()) {
      return
    }

    const searchString = searchParams?.toString() ?? ""
    const pathWithQuery = searchString ? `${pathname}?${searchString}` : pathname

    if (previousPath.current === pathWithQuery) {
      return
    }

    previousPath.current = pathWithQuery
    trackEventSafe("page_view", {
      path: pathname,
      hasQuery: Boolean(searchString)
    })
  }, [pathname, searchParams])

  return null
}
