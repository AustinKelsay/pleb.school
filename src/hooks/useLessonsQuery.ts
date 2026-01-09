/**
 * TanStack Query hook for fetching lessons from a course with their associated resources and Nostr notes
 * Combines data from fake DB and Nostr network with intelligent caching
 * Returns lessons ordered by index with full resource data and parsed Nostr content
 */

import { useQuery } from '@tanstack/react-query'
import { useSnstrContext } from '@/contexts/snstr-context'
import { Lesson, Resource } from '@/data/types'
import { useResourceNotes } from './useResourceNotes'
import { NostrEvent, RelayPool } from 'snstr'

// Types for enhanced lesson data with resource information
export interface ResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

export interface LessonWithResource extends Lesson {
  resource?: ResourceWithNote
  title?: string
  description?: string
  type?: string
  isPremium?: boolean
}

export interface LessonsQueryResult {
  lessons: LessonWithResource[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

// Query keys factory for better cache management
export const lessonsQueryKeys = {
  all: ['lessons'] as const,
  byCourse: () => [...lessonsQueryKeys.all, 'course'] as const,
  course: (courseId: string) => [...lessonsQueryKeys.byCourse(), courseId] as const,
  details: () => [...lessonsQueryKeys.all, 'detail'] as const,
  detail: (lessonId: string) => [...lessonsQueryKeys.details(), lessonId] as const,
  notes: () => [...lessonsQueryKeys.all, 'notes'] as const,
  note: (noteId: string) => [...lessonsQueryKeys.notes(), noteId] as const,
}

// Options for the hook
export interface UseLessonsQueryOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
  select?: (data: LessonWithResource[]) => LessonWithResource[]
}

/**
 * Parse lesson title and metadata from Nostr resource note
 */
function parseLessonFromNote(note?: NostrEvent): {
  title?: string
  description?: string
  type?: string
  isPremium?: boolean
} {
  if (!note || !note.tags) {
    return {}
  }

  const title = note.tags.find(tag => tag[0] === 'title')?.[1] ||
                note.tags.find(tag => tag[0] === 'name')?.[1]
  const description = note.tags.find(tag => tag[0] === 'summary')?.[1] ||
                     note.tags.find(tag => tag[0] === 'description')?.[1] ||
                     note.tags.find(tag => tag[0] === 'about')?.[1]
  const type = note.tags.find(tag => tag[0] === 't' && tag[1] === 'video') ? 'video' : 'document'

  return {
    title,
    description,
    type,
    isPremium: false, // Will be determined by resource price
  }
}

/**
 * Fetch lessons for a course with their associated resources and Nostr notes
 * Returns lessons ordered by index with full metadata
 */
async function fetchLessonsForCourse(courseId: string, relayPool: RelayPool, relays: string[]): Promise<LessonWithResource[]> {
  if (!courseId) {
    return []
  }

  // First, fetch all lessons for the course from API
  const response = await fetch(`/api/courses/${courseId}/lessons`)
  if (!response.ok) {
    throw new Error('Failed to fetch lessons')
  }
  const data = await response.json()
  const lessons = data.lessons || []
  
  if (lessons.length === 0) {
    return []
  }

  console.log(`Fetching ${lessons.length} lessons for course ${courseId}`);
  
  // Get all resource IDs from lessons that have them
  const resourceIds = lessons
    .filter((lesson: any) => lesson.resourceId)
    .map((lesson: any) => lesson.resourceId!)
  
  // Fetch all resources in parallel from API
  const resourcePromises = resourceIds.map(async (id: string) => {
    const response = await fetch(`/api/resources/${id}`)
    if (!response.ok) return null
    const data = await response.json()
    return data.resource || data.data || null
  })
  const resourceResults = await Promise.all(resourcePromises)
  const resources = resourceResults.filter((resource): resource is ResourceWithNote => resource !== null)

  // Create a map of resources by ID for quick lookup
  const resourcesMap = new Map<string, ResourceWithNote>()
  resources.forEach(resource => resourcesMap.set(resource.id, resource))

  // Collect all resource IDs that need Nostr notes fetched
  const resourceIdsForNotes = resources
    .filter(resource => resource.id && !resource.note)
    .map(resource => resource.id)

  // Fetch missing notes in batch if any
  if (resourceIdsForNotes.length > 0) {
    try {
      console.log(`Fetching ${resourceIdsForNotes.length} lesson resource notes from real Nostr relays`)
      
      const notes = await relayPool.querySync(
        relays,
        { "#d": resourceIdsForNotes, kinds: [30023, 30402] }, // Query by 'd' tag and kinds for content events
        { timeout: 10000 }
      )
      
      console.log(`Successfully fetched ${notes.length} lesson resource notes from real Nostr`)
      
      const notesMap = new Map<string, NostrEvent>()
      notes.forEach(note => {
        const dTag = note.tags.find(tag => tag[0] === 'd')
        if (dTag && dTag[1]) {
          notesMap.set(dTag[1], note)
        }
      })
      
      // Update resource notes
      resources.forEach(resource => {
        if (resource.id && notesMap.has(resource.id)) {
          resource.note = notesMap.get(resource.id)
          resourcesMap.set(resource.id, resource)
        }
      })
    } catch (error) {
      console.error('Failed to fetch lesson resource notes from real Nostr:', error)
      resources.forEach(resource => {
        if (resource.id && !resource.note) {
          resource.noteError = error instanceof Error ? error.message : 'Failed to fetch note'
          resourcesMap.set(resource.id, resource)
        }
      })
    }
  }

  // Combine lessons with their resources and parse metadata
  const lessonsWithResources: LessonWithResource[] = lessons.map((lesson: any) => {
    const resource = lesson.resourceId ? resourcesMap.get(lesson.resourceId) : undefined
    const parsedData = parseLessonFromNote(resource?.note)
    
    // Default title if no parsed title available
    const title = parsedData.title || `Lesson ${lesson.index + 1}`
    
    // Determine if premium based on resource price
    const isPremium = (resource?.price ?? 0) > 0
    
    return {
      ...lesson,
      resource,
      title,
      description: parsedData.description,
      type: parsedData.type || 'document',
      isPremium
    }
  })

  // Return lessons sorted by index (already sorted from DB, but ensure consistency)
  return lessonsWithResources.sort((a, b) => a.index - b.index)
}

/**
 * Main hook for fetching lessons for a specific course
 */
export function useLessonsQuery(courseId: string, options: UseLessonsQueryOptions = {}): LessonsQueryResult {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    gcTime = 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
    select,
  } = options

  // First, fetch lessons and resources separately
  const lessonsQuery = useQuery({
    queryKey: lessonsQueryKeys.course(courseId),
    queryFn: async () => {
      if (!courseId) return []
      // Fetch lessons from API endpoint
      const response = await fetch(`/api/courses/${courseId}/lessons`)
      if (!response.ok) {
        throw new Error('Failed to fetch lessons')
      }
      const data = await response.json()
      const lessons = data.lessons || []
      console.log(`Fetching ${lessons.length} lessons for course ${courseId}`)
      return lessons
    },
    enabled: enabled && !!courseId,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  // Extract resource IDs from lessons
  const resourceIds = (lessonsQuery.data || [])
    .filter((lesson: any) => lesson.resourceId)
    .map((lesson: any) => lesson.resourceId!)

  // Fetch resources separately
  const resourcesQuery = useQuery({
    queryKey: [...lessonsQueryKeys.course(courseId), 'resources'],
    queryFn: async () => {
      if (resourceIds.length === 0) return []
      // Fetch resources from API endpoints
      const resourcePromises = resourceIds.map(async (id: string) => {
        const response = await fetch(`/api/resources/${id}`)
        if (!response.ok) return null
        const data = await response.json()
        return data.resource || data.data || null
      })
      const resourceResults = await Promise.all(resourcePromises)
      return resourceResults.filter((resource): resource is Resource => resource !== null)
    },
    enabled: enabled && resourceIds.length > 0,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  // Fetch notes using unified hook (this provides deduplication)
  const notesQuery = useResourceNotes(resourceIds, {
    enabled: enabled && resourceIds.length > 0,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  // Create a map of resources by ID for quick lookup
  const resourcesMap = new Map<string, ResourceWithNote>()
  ;(resourcesQuery.data || []).forEach(resource => {
    const noteResult = notesQuery.notes.get(resource.id)
    resourcesMap.set(resource.id, {
      ...resource,
      note: noteResult?.note,
      noteError: noteResult?.noteError,
    })
  })

  // Combine lessons with their resources and parse metadata
  const lessonsWithResources: LessonWithResource[] = (lessonsQuery.data || []).map((lesson: any) => {
    const resource = lesson.resourceId ? resourcesMap.get(lesson.resourceId) : undefined
    const parsedData = parseLessonFromNote(resource?.note)
    
    // Default title if no parsed title available
    const title = parsedData.title || `Lesson ${lesson.index + 1}`
    
    // Determine if premium based on resource price
    const isPremium = (resource?.price ?? 0) > 0
    
    return {
      ...lesson,
      resource,
      title,
      description: parsedData.description,
      type: parsedData.type || 'document',
      isPremium
    }
  })

  // Sort lessons by index
  const sortedLessons = lessonsWithResources.sort((a, b) => a.index - b.index)

  // Apply select transformation if provided
  const finalData = select ? select(sortedLessons) : sortedLessons

  const isLoading = lessonsQuery.isLoading || resourcesQuery.isLoading || notesQuery.isLoading
  const isError = lessonsQuery.isError || resourcesQuery.isError || notesQuery.isError
  const error = lessonsQuery.error || resourcesQuery.error || notesQuery.error

  return {
    lessons: finalData,
    isLoading,
    isError,
    error,
    refetch: () => {
      lessonsQuery.refetch()
      resourcesQuery.refetch()
      notesQuery.refetch()
    },
  }
}

/**
 * Hook for fetching all lessons (not filtered by course)
 * Useful for admin interfaces or global lesson management
 */
export function useAllLessonsQuery(options: UseLessonsQueryOptions = {}): {
  lessons: Lesson[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
} {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000,
    gcTime = 10 * 60 * 1000,
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: lessonsQueryKeys.all,
    queryFn: async () => {
      const response = await fetch('/api/lessons')
      if (!response.ok) {
        throw new Error('Failed to fetch all lessons')
      }
      const data = await response.json()
      return data.lessons || []
    },
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    lessons: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook for fetching a single lesson by ID with its resource data
 * Useful for lesson detail pages or editing interfaces
 */
export function useLessonQuery(lessonId: string, options: UseLessonsQueryOptions = {}): {
  lesson: LessonWithResource | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
} {
  const { relayPool, relays } = useSnstrContext()
  
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000,
    gcTime = 10 * 60 * 1000,
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: lessonsQueryKeys.detail(lessonId),
    queryFn: async () => {
      // Fetch the lesson from API
      const lessonResponse = await fetch(`/api/lessons/${lessonId}`)
      if (!lessonResponse.ok) return null
      const lessonData = await lessonResponse.json()
      const lesson = lessonData.lesson || lessonData.data
      if (!lesson) return null
      
      // Fetch the course to get all lessons for proper context
      if (lesson.courseId) {
        const courseLessons = await fetchLessonsForCourse(lesson.courseId, relayPool, relays)
        return courseLessons.find(l => l.id === lesson.id) || null
      }
      
      // If no course, just return the lesson with basic resource data
      let resource: ResourceWithNote | undefined
      if (lesson.resourceId) {
        const resourceResponse = await fetch(`/api/resources/${lesson.resourceId}`)
        if (resourceResponse.ok) {
          const resourceData = await resourceResponse.json()
          resource = resourceData.resource || resourceData.data || undefined
        }
      }
      
      const parsedData = parseLessonFromNote(resource?.note)
      const title = parsedData.title || `Lesson ${lesson.index + 1}`
      const isPremium = (resource?.price ?? 0) > 0
      
      return {
        ...lesson,
        resource,
        title,
        description: parsedData.description,
        type: parsedData.type || 'document',
        isPremium
      }
    },
    enabled: enabled && !!lessonId,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    lesson: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
