import { useQuery } from "@tanstack/react-query"
import type { Resource } from "@/data/types"
import type { PaginationOptions } from "@/lib/db-adapter"
import { useViewerPurchasesOverlay } from "@/hooks/useViewerPurchasesOverlay"

interface ResourcePaginationOptions extends PaginationOptions {
  includeLessonResources?: boolean
}

export interface ResourcesListResult {
  resources: Resource[]
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface UseResourcesListQueryOptions extends ResourcePaginationOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
}

export const resourcesListQueryKeys = {
  all: ["resources", "list"] as const,
  list: (includeLessonResources = false) => (
    includeLessonResources
      ? [...resourcesListQueryKeys.all, { includeLessonResources: true }] as const
      : resourcesListQueryKeys.all
  ),
  listPaginated: (page: number, pageSize: number, includeLessonResources = false) => (
    includeLessonResources
      ? [...resourcesListQueryKeys.all, { page, pageSize, includeLessonResources: true }] as const
      : [...resourcesListQueryKeys.all, { page, pageSize }] as const
  ),
}

export async function fetchResourcesList(options?: ResourcePaginationOptions): Promise<ResourcesListResult> {
  const queryParams = new URLSearchParams()
  if (options?.page !== undefined) queryParams.append("page", options.page.toString())
  if (options?.pageSize !== undefined) queryParams.append("pageSize", options.pageSize.toString())
  if (options?.includeLessonResources) {
    queryParams.append("includeLessonResources", "true")
  }

  const response = await fetch(`/api/resources/list${queryParams.toString() ? `?${queryParams}` : ""}`)
  if (!response.ok) {
    throw new Error("Failed to fetch resources")
  }

  const data = await response.json()
  const resources = data.data || data.resources || []
  const pagination = data.pagination

  return {
    resources,
    pagination,
  }
}

export function useResourcesListQuery(options: UseResourcesListQueryOptions = {}) {
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000,
    gcTime = 30 * 60 * 1000,
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
    page,
    pageSize,
    includeLessonResources = false,
  } = options
  const hasPagination = page !== undefined || pageSize !== undefined
  const canonicalPage = page !== undefined ? page : 1
  const canonicalPageSize = pageSize !== undefined ? pageSize : 50

  const resourcesQuery = useQuery({
    queryKey: hasPagination
      ? resourcesListQueryKeys.listPaginated(canonicalPage, canonicalPageSize, includeLessonResources)
      : resourcesListQueryKeys.list(includeLessonResources),
    queryFn: () => fetchResourcesList({
      page: hasPagination ? canonicalPage : undefined,
      pageSize: hasPagination ? canonicalPageSize : undefined,
      includeLessonResources,
    }),
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  const resourceIds = resourcesQuery.data?.resources.map((resource) => resource.id) ?? []
  const overlayEnabled = enabled && resourceIds.length > 0
  const purchasesOverlay = useViewerPurchasesOverlay({
    enabled: overlayEnabled,
    resourceIds,
  })

  const resources = resourcesQuery.data?.resources ?? []
  const mergedResources = resources.map((resource) => ({
    ...resource,
    purchases: purchasesOverlay.data.resources[resource.id] ?? resource.purchases,
  }))

  const mergedData = resourcesQuery.data
    ? {
        ...resourcesQuery.data,
        resources: mergedResources,
      }
    : resourcesQuery.data

  const isLoading = resourcesQuery.isLoading || purchasesOverlay.isLoading
  const isError = resourcesQuery.isError || purchasesOverlay.isError
  const error = resourcesQuery.error ?? purchasesOverlay.error

  return {
    ...resourcesQuery,
    isLoading,
    isError,
    error,
    data: mergedData,
    refetch: async () => {
      const resourcesResult = await resourcesQuery.refetch()
      const latestResourceIds = resourcesResult.data?.resources.map((resource) => resource.id) ?? []
      const latestOverlayEnabled = enabled && latestResourceIds.length > 0

      if (latestOverlayEnabled) {
        await purchasesOverlay.refetch()
      }

      return resourcesResult
    },
  }
}
