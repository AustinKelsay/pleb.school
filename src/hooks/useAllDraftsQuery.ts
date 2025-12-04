'use client'

import { useQuery } from '@tanstack/react-query'
import type { AdditionalLink } from '@/types/additional-links'

// Types matching the API response
interface DraftLesson {
  id: string
  courseDraftId: string
  resourceId?: string | null
  draftId?: string | null
  index: number
}

interface CourseDraft {
  id: string
  userId: string
  title: string
  summary: string
  image?: string | null
  price?: number | null
  topics: string[]
  draftLessons?: DraftLesson[]
  createdAt: string
  updatedAt: string
  draftType: 'course'
  category: string
  lessonCount: number
  estimatedDuration: number
}

interface ResourceDraft {
  id: string
  userId: string
  type: string
  title: string
  summary: string
  content: string
  image?: string | null
  price?: number | null
  topics: string[]
  additionalLinks: AdditionalLink[]
  createdAt: string
  updatedAt: string
  draftType: 'resource'
  category: string
  estimatedReadTime: number
}

type CombinedDraft = CourseDraft | ResourceDraft

// Export types for use in components
export type { CourseDraft, ResourceDraft }

interface DraftsResponse {
  success: boolean
  data: CombinedDraft[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
  stats: {
    totalCourses: number
    totalResources: number
    totalDrafts: number
    premiumDrafts: number
    freeDrafts: number
  }
}

interface UseAllDraftsQueryParams {
  page?: number
  pageSize?: number
  type?: 'course' | 'resource' | 'all'
}

const fetchAllDrafts = async (params: UseAllDraftsQueryParams): Promise<DraftsResponse> => {
  const queryParams = new URLSearchParams()
  
  if (params.page) queryParams.append('page', params.page.toString())
  if (params.pageSize) queryParams.append('pageSize', params.pageSize.toString())
  if (params.type) queryParams.append('type', params.type)

  const response = await fetch(`/api/drafts?${queryParams}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch drafts')
  }

  return response.json()
}

export const useAllDraftsQuery = (params: UseAllDraftsQueryParams = {}) => {
  return useQuery({
    queryKey: ['drafts', 'all', params],
    queryFn: () => fetchAllDrafts(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook for deleting drafts
export const useDeleteDraft = () => {
  const deleteCourseDraft = async (id: string): Promise<void> => {
    const response = await fetch(`/api/drafts/courses/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete course draft')
    }
  }

  const deleteResourceDraft = async (id: string): Promise<void> => {
    const response = await fetch(`/api/drafts/resources/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete resource draft')
    }
  }

  return { deleteCourseDraft, deleteResourceDraft }
}
