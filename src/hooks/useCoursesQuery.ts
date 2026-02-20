/**
 * TanStack Query hook for fetching courses with their associated Nostr notes
 * Combines data from fake DB and Nostr network with intelligent caching
 */

import { useQuery } from '@tanstack/react-query'
import { PaginationOptions } from '@/lib/db-adapter'
import { useSnstrContext } from '@/contexts/snstr-context'
import { Course, Lesson, Resource } from '@/data/types'
import { NostrEvent, RelayPool } from 'snstr'
import logger from '@/lib/logger'

// Types for enhanced course data
export interface CourseWithNote extends Course {
  note?: NostrEvent
  noteError?: string
}

export interface LessonWithResource extends Lesson {
  resource?: ResourceWithNote
}

export interface CourseWithLessons extends CourseWithNote {
  lessons: LessonWithResource[]
}

export interface ResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

export interface LessonWithDetails extends Lesson {
  resource?: ResourceWithNote
  course?: CourseWithNote
}

export interface CoursesQueryResult {
  courses: CourseWithNote[]
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

export interface CourseQueryResult {
  course: CourseWithLessons | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export interface LessonQueryResult {
  lesson: LessonWithDetails | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

// Query keys factory for better cache management
export const coursesQueryKeys = {
  all: ['courses'] as const,
  lists: () => [...coursesQueryKeys.all, 'list'] as const,
  list: (filters: string) => [...coursesQueryKeys.lists(), { filters }] as const,
  listPaginated: (page: number, pageSize: number) => [...coursesQueryKeys.lists(), { page, pageSize }] as const,
  details: () => [...coursesQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...coursesQueryKeys.details(), id] as const,
  notes: () => [...coursesQueryKeys.all, 'notes'] as const,
  note: (noteId: string) => [...coursesQueryKeys.notes(), noteId] as const,
  lessons: () => [...coursesQueryKeys.all, 'lessons'] as const,
  lesson: (courseId: string, lessonId: string) => [...coursesQueryKeys.lessons(), courseId, lessonId] as const,
}

// Options for the hook
export interface UseCoursesQueryOptions extends PaginationOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
  select?: (data: CourseWithNote[]) => CourseWithNote[]
}

// Options for single course query
export interface UseCourseQueryOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
}

// Options for single lesson query
export interface UseLessonQueryOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
  retry?: boolean | number
  retryDelay?: number
}

/**
 * Fetch a single lesson with its resource and course details
 */
export async function fetchLessonWithDetails(
  courseId: string, 
  lessonId: string, 
  relayPool: RelayPool,
  relays: string[]
): Promise<LessonWithDetails | null> {
  try {
    // Fetch lesson details from API
    const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}`)
    if (!response.ok) {
      return null
    }
    
    const { data } = await response.json()
    if (!data) {
      return null
    }

    const lesson = data.lesson
    const course = data.course
    const resource = data.resource

  // Collect IDs that need Nostr notes fetched using 'd' tag queries
  const idsToFetch = []
  if (course?.id && !course.note) {
    idsToFetch.push(course.id)
  }
  if (resource?.id && !resource.note) {
    idsToFetch.push(resource.id)
  }

  if (idsToFetch.length > 0) {
    try {
      logger.debug('Fetching lesson notes from Nostr', { count: idsToFetch.length })
      
      const notes = await relayPool.querySync(
        relays,
        { "#d": idsToFetch, kinds: [30004, 30023, 30402] },
        { timeout: 5000 } // Reduced timeout for faster failures
      )
      
      logger.debug('Fetched lesson notes from Nostr', { count: notes.length })
      
      const notesMap = new Map<string, NostrEvent>()
      notes.forEach(note => {
        const dTag = note.tags.find(tag => tag[0] === 'd')
        if (dTag && dTag[1]) {
          notesMap.set(dTag[1], note)
        }
      })
      
      // Update course note if found
      if (course?.id && notesMap.has(course.id)) {
        course.note = notesMap.get(course.id)
      }
      
      // Update resource note if found
      if (resource?.id && notesMap.has(resource.id)) {
        resource.note = notesMap.get(resource.id)
      }
    } catch (error) {
      console.error('Failed to fetch notes for lesson:', error)
      if (course?.id && !course.note) {
        course.noteError = error instanceof Error ? error.message : 'Failed to fetch note'
      }
      if (resource?.id && !resource.note) {
        resource.noteError = error instanceof Error ? error.message : 'Failed to fetch note'
      }
    }
  }

    return {
      ...lesson,
      resource: resource || undefined,
      course: course || undefined
    }
  } catch (error) {
    console.error('Failed to fetch lesson details:', error)
    return null
  }
}

/**
 * Hook for fetching a single lesson with its resource and course details
 */
export function useLessonQuery(
  courseId: string, 
  lessonId: string, 
  options: UseLessonQueryOptions = {}
): LessonQueryResult {
  const { relayPool, relays } = useSnstrContext()
  
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 10 minutes - increased for less frequent refetches
    gcTime = 30 * 60 * 1000, // 30 minutes - keep data in cache longer
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: coursesQueryKeys.lesson(courseId, lessonId),
    queryFn: () => fetchLessonWithDetails(courseId, lessonId, relayPool, relays),
    enabled: enabled && !!courseId && !!lessonId,
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

/**
 * Fetch courses with their associated Nostr notes efficiently
 * Uses batch querying to fetch all notes at once instead of individual requests
 */
export async function fetchCoursesWithNotes(
  relayPool: RelayPool, 
  relays: string[], 
  options?: PaginationOptions
): Promise<{
  courses: CourseWithNote[]
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}> {
  // Fetch courses from API
  const queryParams = new URLSearchParams()
  if (options?.page) queryParams.append('page', options.page.toString())
  if (options?.pageSize) queryParams.append('pageSize', options.pageSize.toString())
  
  const response = await fetch(`/api/courses/list${queryParams.toString() ? `?${queryParams}` : ''}`)
  if (!response.ok) {
    throw new Error('Failed to fetch courses')
  }

  const responseData = await response.json()
  // Handle both paginated ({ data, pagination }) and non-paginated ({ courses }) responses
  const courses = responseData.data || responseData.courses || []
  const pagination = responseData.pagination
    
    logger.debug('Fetched course list from API', { count: courses.length })
    
    // Extract all course IDs for 'd' tag queries
    const courseIds = courses.map((course: any) => course.id)
    
    if (courseIds.length === 0) {
      return {
        courses: courses.map((course: any) => ({ ...course })),
        pagination
      }
    }

    logger.debug("Fetching course notes from Nostr by 'd' tags", { count: courseIds.length })
    
    // Fetch all notes at once using RelayPool's querySync method with 'd' tag queries
    let notes: NostrEvent[] = []
    let noteError: string | undefined

    try {
      notes = await relayPool.querySync(
        relays,
        { "#d": courseIds, kinds: [30004, 30023, 30402] }, // Query by 'd' tag for course list and content events
        { timeout: 5000 } // Reduced timeout for faster failures
      )
      logger.debug('Fetched course notes from Nostr', { count: notes.length })
    } catch (error) {
      console.error('Failed to fetch course notes from real Nostr:', error)
      noteError = error instanceof Error ? error.message : 'Failed to fetch notes'
    }

    // Create a Map for O(1) lookup of notes by 'd' tag value
    const notesMap = new Map<string, NostrEvent>()
    notes.forEach(note => {
      const dTag = note.tags.find(tag => tag[0] === 'd')
      if (dTag && dTag[1]) {
        notesMap.set(dTag[1], note)
      }
    })

    // Combine courses with their notes
    const coursesWithNotes = courses.map((course: any) => {
      const note = notesMap.get(course.id)
      
      return {
        ...course,
        note,
        noteError: !note ? noteError : undefined,
      }
    })

    return {
      courses: coursesWithNotes,
      pagination
    }
}

/**
 * Fetch a single course with its lessons and Nostr note
 */
export async function fetchCourseWithLessons(courseId: string, relayPool: RelayPool, relays: string[]): Promise<CourseWithLessons | null> {
  // Fetch course with lessons from API
  const response = await fetch(`/api/courses/${courseId}`)
  if (!response.ok) {
    return null
  }

  const responseData = await response.json()
  const data = responseData.data || responseData.course // Handle both { data } and { course } formats
  if (!data) {
    return null
  }

  const courseWithNote = data
  const lessons = data.lessons || []

  // Extract resources from lessons
  const resources = lessons
    .filter((lesson: any) => lesson.resource)
    .map((lesson: any) => lesson.resource)

  // Create a map of resources by ID for quick lookup
  const resourcesMap = new Map<string, ResourceWithNote>()
  resources.forEach((resource: ResourceWithNote) => resourcesMap.set(resource.id, resource))

  // Extract resource IDs
  const resourceIds = resources.map((r: any) => r.id)

  // Collect all IDs that need Nostr notes fetched (course ID + resource IDs)
  const idsToFetch = [courseId, ...resourceIds]

  // Fetch notes by 'd' tag in one batch query
  if (idsToFetch.length > 0) {
    try {
      logger.debug('Fetching course + lesson notes from Nostr', { count: idsToFetch.length })
      
      const notes = await relayPool.querySync(
        relays,
        { "#d": idsToFetch, kinds: [30004, 30023, 30402] }, // Course lists and content events
        { timeout: 5000 } // Reduced timeout for faster failures
      )
      
      logger.debug('Fetched course + lesson notes from Nostr', { count: notes.length })
      
      const notesMap = new Map<string, NostrEvent>()
      notes.forEach(note => {
        const dTag = note.tags.find(tag => tag[0] === 'd')
        if (dTag && dTag[1]) {
          notesMap.set(dTag[1], note)
        }
      })
      
      // Update course note if found
      if (notesMap.has(courseId)) {
        courseWithNote.note = notesMap.get(courseId)
      }
      
      // Update resource notes if found
      resources.forEach((resource: ResourceWithNote) => {
        if (notesMap.has(resource.id)) {
          resource.note = notesMap.get(resource.id)
          resourcesMap.set(resource.id, resource)
        }
      })
    } catch (error) {
      console.error('Failed to fetch notes for course and lessons:', error)
      if (courseWithNote.noteId && !courseWithNote.note) {
        courseWithNote.noteError = error instanceof Error ? error.message : 'Failed to fetch note'
      }
      resources.forEach((resource: ResourceWithNote) => {
        if (resource.noteId && !resource.note) {
          resource.noteError = error instanceof Error ? error.message : 'Failed to fetch note'
          resourcesMap.set(resource.id, resource)
        }
      })
    }
  }

  // Create lessons with their associated resources
  const lessonsWithResources: LessonWithResource[] = lessons.map((lesson: any) => ({
    ...lesson,
    resource: lesson.resourceId ? resourcesMap.get(lesson.resourceId) : undefined
  }))

  return {
    ...courseWithNote,
    lessons: lessonsWithResources.sort((a, b) => a.index - b.index)
  }
}

/**
 * Hook for fetching a single course with its lessons and Nostr note
 */
export function useCourseQuery(courseId: string, options: UseCourseQueryOptions = {}): CourseQueryResult {
  const { relayPool, relays } = useSnstrContext()
  
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 10 minutes - increased for less frequent refetches
    gcTime = 30 * 60 * 1000, // 30 minutes - keep data in cache longer
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    retry = 3,
    retryDelay = 1000,
  } = options

  const query = useQuery({
    queryKey: coursesQueryKeys.detail(courseId),
    queryFn: () => fetchCourseWithLessons(courseId, relayPool, relays),
    enabled: enabled && !!courseId,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  return {
    course: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Main hook for fetching courses with their Nostr notes
 */
export function useCoursesQuery(options: UseCoursesQueryOptions = {}): CoursesQueryResult {
  const { relayPool, relays } = useSnstrContext()
  
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000, // 10 minutes - increased for less frequent refetches
    gcTime = 30 * 60 * 1000, // 30 minutes - keep data in cache longer
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
      ? coursesQueryKeys.listPaginated(page || 1, pageSize || 50)
      : coursesQueryKeys.lists(),
    queryFn: () => fetchCoursesWithNotes(relayPool, relays, { page, pageSize }),
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    retry,
    retryDelay,
  })

  // Apply select transformation if provided
  const finalData = select && query.data?.courses ? select(query.data.courses) : query.data?.courses || []

  return {
    courses: finalData,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    pagination: query.data?.pagination,
    refetch: query.refetch,
  }
}


