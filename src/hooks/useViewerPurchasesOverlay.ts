import { useRef } from "react"
import { useQuery } from "@tanstack/react-query"

import { useSession } from "@/hooks/useSession"

export interface OverlayPurchase {
  id: string
  amountPaid?: number
  priceAtPurchase?: number
  createdAt?: string
  updatedAt?: string
}

export interface ViewerPurchasesOverlay {
  resources: Record<string, OverlayPurchase[]>
  courses: Record<string, OverlayPurchase[]>
}

const EMPTY_OVERLAY: ViewerPurchasesOverlay = {
  resources: {},
  courses: {},
}

interface UseViewerPurchasesOverlayOptions {
  resourceIds?: string[]
  courseIds?: string[]
  enabled?: boolean
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  ).sort()
}

async function fetchViewerPurchasesOverlay(payload: {
  resourceIds?: string[]
  courseIds?: string[]
}): Promise<ViewerPurchasesOverlay> {
  const response = await fetch("/api/purchases/overlay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceIds: payload.resourceIds ?? [],
      courseIds: payload.courseIds ?? [],
    }),
  })

  if (response.status === 401) {
    return EMPTY_OVERLAY
  }

  if (!response.ok) {
    if (response.status >= 500) {
      const body = await response.text().catch(() => "")
      throw new Error(
        `Failed to fetch purchases overlay (${response.status})${body ? `: ${body}` : ""}`
      )
    }
    return EMPTY_OVERLAY
  }

  const body = await response.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return EMPTY_OVERLAY
  }

  return {
    resources: (body as ViewerPurchasesOverlay).resources ?? {},
    courses: (body as ViewerPurchasesOverlay).courses ?? {},
  }
}

export function useViewerPurchasesOverlay(options: UseViewerPurchasesOverlayOptions = {}) {
  const { data: session, status } = useSession()
  const resourceIdsInput = options.resourceIds ?? []
  const courseIdsInput = options.courseIds ?? []

  const resourceIdsCacheRef = useRef<{ inputKey: string; value: string[] }>({
    inputKey: "__unset__",
    value: [],
  })
  const courseIdsCacheRef = useRef<{ inputKey: string; value: string[] }>({
    inputKey: "__unset__",
    value: [],
  })

  const resourceIdsInputKey = JSON.stringify(resourceIdsInput)
  if (resourceIdsCacheRef.current.inputKey !== resourceIdsInputKey) {
    resourceIdsCacheRef.current = {
      inputKey: resourceIdsInputKey,
      value: uniqueIds(resourceIdsInput),
    }
  }
  const resourceIds = resourceIdsCacheRef.current.value

  const courseIdsInputKey = JSON.stringify(courseIdsInput)
  if (courseIdsCacheRef.current.inputKey !== courseIdsInputKey) {
    courseIdsCacheRef.current = {
      inputKey: courseIdsInputKey,
      value: uniqueIds(courseIdsInput),
    }
  }
  const courseIds = courseIdsCacheRef.current.value

  const enabled = options.enabled ?? true
  const shouldFetch =
    enabled &&
    status === "authenticated" &&
    (resourceIds.length > 0 || courseIds.length > 0)

  const query = useQuery({
    queryKey: [
      "viewer-purchases-overlay",
      session?.user?.id ?? "anonymous",
      resourceIds,
      courseIds,
    ],
    queryFn: () => fetchViewerPurchasesOverlay({ resourceIds, courseIds }),
    enabled: shouldFetch,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    ...query,
    data: query.data ?? EMPTY_OVERLAY,
  }
}
