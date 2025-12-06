/**
 * Database adapter for real database operations using Prisma
 * Provides the same interface as mock-db-adapter for seamless integration
 */

import { prisma } from '@/lib/prisma'
import { Course, Resource, Lesson } from '@/data/types'
import { NostrEvent } from 'snstr'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { NostrFetchService } from '@/lib/nostr-fetch-service'
import type { Prisma } from '@prisma/client'

const courseUserSelect = {
  id: true,
  username: true,
  pubkey: true,
  avatar: true,
  nip05: true,
  lud16: true,
  displayName: true,
} satisfies Prisma.UserSelect

type CourseUser = Prisma.UserGetPayload<{ select: typeof courseUserSelect }>

function transformUser(user?: CourseUser | null): Course['user'] {
  if (!user) return undefined
  return {
    id: user.id,
    username: user.username ?? undefined,
    pubkey: user.pubkey ?? undefined,
    avatar: user.avatar ?? undefined,
    nip05: user.nip05 ?? undefined,
    lud16: user.lud16 ?? undefined,
    displayName: user.displayName ?? undefined,
  }
}

// Helper functions to transform Prisma data to match TypeScript interfaces
function transformResource(resource: any): Resource {
  return {
    ...resource,
    noteId: resource.noteId ?? undefined,
    videoId: resource.videoId ?? undefined,
    videoUrl: resource.videoUrl ?? undefined,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
    purchases: Array.isArray(resource.purchases) ? resource.purchases.map((p: any) => ({
      ...p,
      createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
      updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
    })) : undefined
  }
}

function transformCourse(course: any): Course {
  return {
    ...course,
    noteId: course.noteId ?? undefined,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    purchases: Array.isArray(course.purchases) ? course.purchases.map((p: any) => ({
      ...p,
      createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
      updatedAt: p.updatedAt?.toISOString?.() ?? p.updatedAt,
    })) : undefined,
    user: transformUser(course.user),
  }
}

function transformLesson(lesson: any): Lesson {
  return {
    ...lesson,
    courseId: lesson.courseId ?? undefined,
    resourceId: lesson.resourceId ?? undefined,
    draftId: lesson.draftId ?? undefined,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString()
  }
}

// ============================================================================
// PURCHASE ADAPTER
// ============================================================================

export interface PurchaseRecord {
  id: string
  amountPaid: number
  priceAtPurchase?: number | null
  createdAt: Date
}

export class PurchaseAdapter {
  static async findByUserAndCourse(userId: string, courseId: string): Promise<PurchaseRecord[]> {
    const purchases = await prisma.purchase.findMany({
      where: { userId, courseId },
      select: { id: true, amountPaid: true, priceAtPurchase: true, createdAt: true }
    })

    return purchases.map((purchase) => ({
      id: purchase.id,
      amountPaid: purchase.amountPaid,
      priceAtPurchase: purchase.priceAtPurchase,
      createdAt: purchase.createdAt
    }))
  }

  static async findByUserAndResource(userId: string, resourceId: string): Promise<PurchaseRecord[]> {
    const purchases = await prisma.purchase.findMany({
      where: { userId, resourceId },
      select: { id: true, amountPaid: true, priceAtPurchase: true, createdAt: true }
    })

    return purchases.map((purchase) => ({
      id: purchase.id,
      amountPaid: purchase.amountPaid,
      priceAtPurchase: purchase.priceAtPurchase,
      createdAt: purchase.createdAt
    }))
  }
}

// Pagination options for query functions
export interface PaginationOptions {
  page?: number
  pageSize?: number
  userId?: string
}

// Extended types with Nostr note data
export interface CourseWithNote extends Course {
  note?: NostrEvent
  noteError?: string
}

export interface ResourceWithNote extends Resource {
  note?: NostrEvent
  noteError?: string
}

// Helper function to fetch Nostr event from relays
async function fetchNostrEvent(noteId: string | null): Promise<NostrEvent | undefined> {
  if (!noteId) return undefined
  
  try {
    // Only fetch on client side
    if (typeof window === 'undefined') {
      return undefined
    }
    
    const event = await NostrFetchService.fetchEventById(noteId)
    return event || undefined
  } catch (error) {
    console.error('Error fetching Nostr event:', error)
    return undefined
  }
}

// ============================================================================
// COURSE ADAPTER
// ============================================================================

export class CourseAdapter {
  static async findAll(): Promise<Course[]> {
    const courses = await prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: courseUserSelect }
      }
    })
    return courses.map(transformCourse)
  }

  static async findAllPaginated(options?: PaginationOptions): Promise<{
    data: Course[]
    pagination: {
      page: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }> {
    const page = options?.page || 1
    const pageSize = options?.pageSize || 50
    const skip = (page - 1) * pageSize

    const [courses, totalItems] = await Promise.all([
      prisma.course.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: courseUserSelect }
        }
      }),
      prisma.course.count()
    ])

    const totalPages = Math.ceil(totalItems / pageSize)

    return {
      data: courses.map(transformCourse),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }

  static async findById(id: string, userId?: string): Promise<Course | null> {
    const include: Prisma.CourseInclude = {
      user: { select: courseUserSelect }
    }

    if (userId) {
      include.purchases = { where: { userId } }
    }

    const course = await prisma.course.findUnique({
      where: { id },
      include
    })
    if (!course) return null
    return transformCourse(course)
  }

  static async findByIdWithNote(id: string): Promise<CourseWithNote | null> {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        user: { select: courseUserSelect }
      }
    })
    
    if (!course) return null
    
    // Fetch the associated Nostr note
    const note = await fetchNostrEvent(course.noteId)
    
    return {
      ...transformCourse(course),
      note
    }
  }

  static async create(courseData: Omit<Course, 'id' | 'createdAt' | 'updatedAt' | 'user' | 'purchases'>): Promise<Course> {
    const course = await prisma.course.create({
      data: {
        ...courseData,
        noteId: courseData.noteId || null,
        id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      }
    })
    return transformCourse(course)
  }

  static async update(id: string, updates: Partial<Omit<Course, 'user' | 'purchases'>>): Promise<Course | null> {
    try {
      const course = await prisma.course.update({
        where: { id },
        data: updates
      })
      return transformCourse(course)
    } catch (error) {
      return null
    }
  }

  static async delete(id: string): Promise<boolean> {
    try {
      await prisma.course.delete({
        where: { id }
      })
      return true
    } catch (error) {
      return false
    }
  }

  static async findByUserId(userId: string): Promise<Course[]> {
    const courses = await prisma.course.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: courseUserSelect }
      }
    })
    return courses.map(transformCourse)
  }

  static async findByNoteId(noteId: string): Promise<Course | null> {
    const course = await prisma.course.findUnique({
      where: { noteId },
      include: {
        user: { select: courseUserSelect }
      }
    })
    if (!course) return null
    return transformCourse(course)
  }
}

// ============================================================================
// RESOURCE ADAPTER
// ============================================================================

export class ResourceAdapter {
  static async findAll(options?: { includeLessonResources?: boolean; userId?: string }): Promise<Resource[]> {
    const includeLessonResources = options?.includeLessonResources ?? false
    const where: Prisma.ResourceWhereInput | undefined = includeLessonResources
      ? undefined
      : {
          lessons: {
            none: {
              courseId: { not: null }
            }
          }
        }

    const resources = await prisma.resource.findMany({
      orderBy: { createdAt: 'desc' },
      include: options?.userId
        ? { purchases: { where: { userId: options.userId } } }
        : undefined,
      ...(where ? { where } : {})
    })
    return resources.map(transformResource)
  }

  static async findAllPaginated(options?: PaginationOptions & { includeLessonResources?: boolean }): Promise<{
    data: Resource[]
    pagination: {
      page: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }> {
    const page = options?.page || 1
    const pageSize = options?.pageSize || 50
    const includeLessonResources = options?.includeLessonResources ?? false
    const skip = (page - 1) * pageSize
    const where: Prisma.ResourceWhereInput | undefined = includeLessonResources
      ? undefined
      : {
          lessons: {
            none: {
              courseId: { not: null }
            }
          }
        }

    const findManyArgs: Prisma.ResourceFindManyArgs = {
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: options?.userId
        ? { purchases: { where: { userId: options.userId } } }
        : undefined,
      ...(where ? { where } : {})
    }

    const countArgs: Prisma.ResourceCountArgs = {
      ...(where ? { where } : {})
    }

    const [resources, totalItems] = await Promise.all([
      prisma.resource.findMany(findManyArgs),
      prisma.resource.count(countArgs)
    ])

    const totalPages = Math.ceil(totalItems / pageSize)

    return {
      data: resources.map(transformResource),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }

  static async findById(id: string, userId?: string): Promise<Resource | null> {
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: userId ? { purchases: { where: { userId } } } : undefined
    })
    return resource ? transformResource(resource) : null
  }

  static async findByIdWithNote(id: string, userId?: string): Promise<ResourceWithNote | null> {
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: userId ? { purchases: { where: { userId } } } : undefined
    })
    
    if (!resource) return null
    
    // Fetch the associated Nostr note
    const note = await fetchNostrEvent(resource.noteId)
    
    return {
      ...transformResource(resource),
      note
    }
  }

  static async create(resourceData: Omit<Resource, 'id'>): Promise<Resource> {
    const { purchases: _purchases, ...resourceDataWithoutPurchases } = resourceData
    const resource = await prisma.resource.create({
      data: {
        ...resourceDataWithoutPurchases,
        id: (resourceData as any).id || `resource-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        createdAt: new Date((resourceData as any).createdAt || new Date()),
        updatedAt: new Date((resourceData as any).updatedAt || new Date())
      }
    })
    return transformResource(resource)
  }

  static async update(id: string, updates: Partial<Resource>): Promise<Resource | null> {
    try {
      const { purchases: _purchases, id: _id, userId: _userId, ...safeUpdates } = updates
      const resource = await prisma.resource.update({
        where: { id },
        data: {
          ...safeUpdates,
          updatedAt: new Date()
        }
      })
      return transformResource(resource)
    } catch (error) {
      return null
    }
  }

  static async delete(id: string): Promise<boolean> {
    try {
      await prisma.resource.delete({
        where: { id }
      })
      return true
    } catch (error) {
      return false
    }
  }

  static async findByUserId(userId: string): Promise<Resource[]> {
    const resources = await prisma.resource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
    return resources.map(transformResource)
  }

  static async findByNoteId(noteId: string): Promise<Resource | null> {
    const resource = await prisma.resource.findUnique({
      where: { noteId }
    })
    return resource ? transformResource(resource) : null
  }

  static async findByVideoId(videoId: string): Promise<Resource | null> {
    const resource = await prisma.resource.findFirst({
      where: { videoId }
    })
    return resource ? transformResource(resource) : null
  }

  static async findFree(): Promise<Resource[]> {
    const resources = await prisma.resource.findMany({
      where: { price: 0 },
      orderBy: { createdAt: 'desc' }
    })
    return resources.map(transformResource)
  }

  static async findPaid(): Promise<Resource[]> {
    const resources = await prisma.resource.findMany({
      where: { price: { gt: 0 } },
      orderBy: { createdAt: 'desc' }
    })
    return resources.map(transformResource)
  }

  static async isLesson(resourceId: string): Promise<boolean> {
    const lesson = await prisma.lesson.findFirst({
      where: { 
        resourceId,
        courseId: { not: null }
      }
    })
    return !!lesson
  }
}

// ============================================================================
// LESSON ADAPTER
// ============================================================================

export class LessonAdapter {
  static async findAll(): Promise<Lesson[]> {
    const lessons = await prisma.lesson.findMany({
      orderBy: [
        { courseId: 'asc' },
        { index: 'asc' }
      ]
    })
    return lessons.map(transformLesson)
  }

  static async findById(id: string): Promise<Lesson | null> {
    const lesson = await prisma.lesson.findUnique({
      where: { id }
    })
    return lesson ? transformLesson(lesson) : null
  }

  static async findByCourseId(courseId: string): Promise<Lesson[]> {
    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      orderBy: { index: 'asc' }
    })
    return lessons.map(transformLesson)
  }

  static async findByResourceId(resourceId: string): Promise<Lesson[]> {
    const lessons = await prisma.lesson.findMany({
      where: { resourceId },
      orderBy: [
        { courseId: 'asc' },
        { index: 'asc' }
      ]
    })
    return lessons.map(transformLesson)
  }

  static async create(lessonData: Omit<Lesson, 'id'>): Promise<Lesson> {
    const lesson = await prisma.lesson.create({
      data: {
        ...lessonData,
        createdAt: new Date((lessonData as any).createdAt || new Date()),
        updatedAt: new Date((lessonData as any).updatedAt || new Date())
      }
    })
    return transformLesson(lesson)
  }

  static async update(id: string, updates: Partial<Lesson>): Promise<Lesson | null> {
    try {
      const lesson = await prisma.lesson.update({
        where: { id },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      })
      return transformLesson(lesson)
    } catch (error) {
      return null
    }
  }

  static async delete(id: string): Promise<boolean> {
    try {
      await prisma.lesson.delete({
        where: { id }
      })
      return true
    } catch (error) {
      return false
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// These functions should only be called from server-side code
export function getCoursesSync(): Course[] {
  console.warn('getCoursesSync() should only be called from server-side code')
  return []
}

export function getResourcesSync(): Resource[] {
  console.warn('getResourcesSync() should only be called from server-side code')
  return []
}

export function getLessonsSync(): Lesson[] {
  console.warn('getLessonsSync() should only be called from server-side code')
  return []
}

export function getSeedDataStats() {
  return {
    courses: 0,
    resources: 0,
    lessons: 0,
    coursesFromSeed: 0,
    resourcesFromSeed: 0,
    lessonsFromSeed: 0
  }
}

// Not applicable for real DB
export function resetSeedData() {
  console.warn('resetSeedData() is not applicable for real database')
}
