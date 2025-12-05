import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NostrEvent } from 'snstr'
import { publishedContentQueryKeys } from './usePublishedContentQuery'
import { resourceNotesQueryKeys } from './useResourceNotes'
import { courseNotesQueryKeys } from './useCourseNotes'
import type { AdditionalLink } from '@/types/additional-links'

type RepublishResourcePayload = {
  id: string
  data: {
    title: string
    summary: string
    content: string
    price: number
    image?: string
    topics: string[]
    additionalLinks: AdditionalLink[]
    type: 'document' | 'video'
    videoUrl?: string
    signedEvent?: NostrEvent
    privkey?: string
    relays?: string[]
    relaySet?: 'default' | 'content' | 'profile' | 'zapThreads'
  }
}

type RepublishCoursePayload = {
  id: string
  data: {
    title: string
    summary: string
    image?: string
    price: number
    topics: string[]
    signedEvent?: NostrEvent
    privkey?: string
    relays?: string[]
    relaySet?: 'default' | 'content' | 'profile' | 'zapThreads'
  }
}

type DeletePayload = {
  id: string
}

async function republishResource({ id, data }: RepublishResourcePayload) {
  const response = await fetch(`/api/resources/${id}/republish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      typeof errorBody.error === 'string' ? errorBody.error : 'Failed to republish resource'
    const error = new Error(message) as Error & { code?: string }
    // Extract error code from nested path or direct property, matching delete mutations
    const extractedCode = errorBody.error?.code ?? errorBody.code
    if (typeof extractedCode === 'string') {
      error.code = extractedCode
    }
    throw error
  }

  // Check for empty/no-content responses before parsing JSON (mirroring delete handlers)
  if (
    response.status === 204 ||
    response.headers.get('Content-Length') === '0' ||
    !response.headers.get('Content-Type')?.includes('application/json')
  ) {
    return null
  }

  // Check if response body is empty by reading text first
  const text = await response.text()
  if (!text || text.trim() === '') {
    return null
  }

  // Parse JSON from the text content
  return JSON.parse(text)
}

async function republishCourse({ id, data }: RepublishCoursePayload) {
  const response = await fetch(`/api/courses/${id}/republish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      typeof errorBody.error === 'string' ? errorBody.error : 'Failed to republish course'
    const error = new Error(message) as Error & { code?: string }
    // Extract error code from nested path or direct property, matching delete mutations
    const extractedCode = errorBody.error?.code ?? errorBody.code
    if (typeof extractedCode === 'string') {
      error.code = extractedCode
    }
    throw error
  }

  // Check for empty/no-content responses before parsing JSON (mirroring delete handlers)
  if (
    response.status === 204 ||
    response.headers.get('Content-Length') === '0' ||
    !response.headers.get('Content-Type')?.includes('application/json')
  ) {
    return null
  }

  // Check if response body is empty by reading text first
  const text = await response.text()
  if (!text || text.trim() === '') {
    return null
  }

  // Parse JSON from the text content
  return JSON.parse(text)
}

async function deleteResource({ id }: DeletePayload) {
  const response = await fetch(`/api/resources/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      typeof errorBody.error === 'string' ? errorBody.error : 'Failed to delete resource'
    const error = new Error(message) as Error & { code?: string }
    // Extract error code from nested path or direct property, matching republish mutations
    const extractedCode = errorBody.error?.code ?? errorBody.code
    if (typeof extractedCode === 'string') {
      error.code = extractedCode
    }
    throw error
  }

  if (
    response.status === 204 ||
    response.headers.get('Content-Length') === '0' ||
    !response.headers.get('Content-Type')?.includes('application/json')
  ) {
    return null
  }

  return response.json()
}

async function deleteCourse({ id }: DeletePayload) {
  const response = await fetch(`/api/courses/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message =
      typeof errorBody.error === 'string' ? errorBody.error : 'Failed to delete course'
    const error = new Error(message) as Error & { code?: string }
    // Extract error code from nested path or direct property, matching republish mutations
    const extractedCode = errorBody.error?.code ?? errorBody.code
    if (typeof extractedCode === 'string') {
      error.code = extractedCode
    }
    throw error
  }

  if (
    response.status === 204 ||
    response.headers.get('Content-Length') === '0' ||
    !response.headers.get('Content-Type')?.includes('application/json')
  ) {
    return null
  }

  return response.json()
}

export function useRepublishResourceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: republishResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publishedContentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: resourceNotesQueryKeys.all })
    },
  })
}

export function useRepublishCourseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: republishCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publishedContentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: courseNotesQueryKeys.all })
    },
  })
}

export function useDeleteResourceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publishedContentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: resourceNotesQueryKeys.all })
    },
  })
}

export function useDeleteCourseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publishedContentQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: courseNotesQueryKeys.all })
    },
  })
}
