/**
 * TanStack Query hook for fetching draft resources
 * Fetches drafts from the database with pagination support
 */

import { useQuery } from '@tanstack/react-query'
import type { Draft } from '@/generated/prisma'

export interface DraftsQueryResult {
  drafts: Draft[]
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

// Query keys factory for better cache management
export const draftsQueryKeys = {
  all: ['drafts'] as const,
  lists: () => [...draftsQueryKeys.all, 'list'] as const,
  list: (filters: string) => [...draftsQueryKeys.lists(), { filters }] as const,
  listPaginated: (page: number, pageSize: number) => [...draftsQueryKeys.lists(), { page, pageSize }] as const,
  details: () => [...draftsQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...draftsQueryKeys.details(), id] as const,
}

// Options for the hook
export interface UseDraftsQueryOptions {
  page?: number
  pageSize?: number
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
  select?: (data: Draft[]) => Draft[]
}

/**
 * Fetch draft resources from the API
 */
export async function fetchDrafts(options?: { page?: number; pageSize?: number }): Promise<{ 
  drafts: Draft[], 
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}> {
  const params = new URLSearchParams()
  if (options?.page) params.append('page', options.page.toString())
  if (options?.pageSize) params.append('pageSize', options.pageSize.toString())
  
  const response = await fetch(`/api/drafts/resources?${params}`, {
    method: 'GET',
    credentials: 'include', // Include cookies for authentication
    headers: {
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch drafts' }))
    throw new Error(error.error || 'Failed to fetch drafts')
  }
  
  const result = await response.json()
  
  // Ensure we always return an array
  return {
    drafts: Array.isArray(result.data) ? result.data : [],
    pagination: result.pagination
  }
}

/**
 * Main hook for fetching draft resources
 */
export function useDraftsQuery(options: UseDraftsQueryOptions = {}): DraftsQueryResult {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    gcTime = 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
    select,
    page,
    pageSize,
  } = options

  const query = useQuery({
    queryKey: page !== undefined || pageSize !== undefined 
      ? draftsQueryKeys.listPaginated(page || 1, pageSize || 50)
      : draftsQueryKeys.lists(),
    queryFn: () => fetchDrafts({ page, pageSize }),
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  const drafts = query.data?.drafts || []
  const finalData = select ? select(drafts) : drafts

  return {
    drafts: finalData,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    pagination: query.data?.pagination,
    refetch: query.refetch,
  }
}