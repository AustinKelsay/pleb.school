/**
 * Database adapter for real database operations using Prisma
 * Provides the same interface as mock-db-adapter for seamless integration
 */

import { prisma } from '@/lib/prisma'
import { Course, Resource, Lesson } from '@/data/types'
import { NostrEvent } from 'snstr'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { NostrFetchService } from '@/lib/nostr-fetch-service'
import type { Prisma } from '@/generated/prisma'

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

  static async countByCourse(courseId: string): Promise<number> {
    return prisma.purchase.count({
      where: { courseId }
    })
  }
}

// ============================================================================
// USER ADAPTER
// ============================================================================

export class UserAdapter {
  /**
   * Persist the anonymous reconnect token hash for a user.
   * Pass `null` to revoke any existing reconnect token hash.
   */
  static async setAnonReconnectTokenHash(userId: string, tokenHash: string | null): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { anonReconnectTokenHash: tokenHash },
    })
  }
}

// ============================================================================
// AUDIT LOG ADAPTER
// ============================================================================

/**
 * Input shape for persisting an audit log entry.
 * Mirrors the persisted fields (userId, action, details, ip, userAgent).
 */
export interface AuditLogCreateInput {
  userId: string
  action: string
  details: Prisma.InputJsonValue
  ip?: string | null
  userAgent?: string | null
}

export type AuditLogClient = Pick<typeof prisma, 'auditLog'>
export const AUDIT_LOG_DELETE_BATCH_SIZE = 10_000

/** Bigint key for pg_try_advisory_xact_lock during audit log purge. Ensures only one maintenance worker processes at a time. */
const AUDIT_LOG_MAINTENANCE_LOCK_KEY = 0x6175646974 // "audit" in hex, fits in JS safe integer
export const AUDIT_LOG_PURGE_TX_MAX_WAIT_MS = 10_000
export const AUDIT_LOG_PURGE_TX_TIMEOUT_MS = 300_000

/**
 * Adapter for persisting audit logs.
 * Centralizes AuditLog writes so callers (e.g. audit-logger) never access Prisma directly.
 */
export class AuditLogAdapter {
  /**
   * Persist an audit event to the database.
   * Caller is responsible for error handling (e.g. audit logging should never throw).
   *
   * @param input - The audit event data to persist
   */
  static async create(input: AuditLogCreateInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        details: input.details,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  }

  /**
   * Delete audit log records older than the given cutoff timestamp.
   * Uses a PostgreSQL advisory lock so only one maintenance worker processes at a time,
   * preventing double-counting and redundant work when concurrent jobs run.
   *
   * @param cutoff - Records with createdAt < cutoff are deleted
   * @returns Number of deleted rows (0 if another worker holds the lock)
   */
  static async deleteOlderThan(cutoff: Date): Promise<number> {
    if (!Number.isFinite(cutoff.getTime())) {
      throw new TypeError("cutoff must be a valid Date.")
    }

    if (cutoff.getTime() > Date.now()) {
      throw new RangeError("cutoff must not be in the future.")
    }

    return prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        [{ pg_try_advisory_xact_lock: boolean }]
      >`SELECT pg_try_advisory_xact_lock(${AUDIT_LOG_MAINTENANCE_LOCK_KEY}) AS "pg_try_advisory_xact_lock"`
      if (!row?.pg_try_advisory_xact_lock) {
        return 0
      }

      let totalDeleted = 0
      while (true) {
        const rows = await tx.auditLog.findMany({
          where: {
            createdAt: {
              lt: cutoff,
            },
          },
          select: { id: true },
          take: AUDIT_LOG_DELETE_BATCH_SIZE,
        })

        if (rows.length === 0) {
          break
        }

        const ids = rows.map((row) => row.id)
        const result = await tx.auditLog.deleteMany({
          where: {
            id: { in: ids },
          },
        })
        totalDeleted += result.count
      }
      return totalDeleted
    }, {
      maxWait: AUDIT_LOG_PURGE_TX_MAX_WAIT_MS,
      timeout: AUDIT_LOG_PURGE_TX_TIMEOUT_MS,
    })
  }

  /**
   * Anonymize PII columns for all audit records matching a user ID.
   * Intentionally preserves action/details/timestamps for forensic integrity.
   *
   * @param userId - User identifier stored in audit logs
   * @returns Number of updated rows
   */
  static async anonymizeByUserId(userId: string): Promise<number>
  static async anonymizeByUserId(client: AuditLogClient, userId: string): Promise<number>
  static async anonymizeByUserId(
    userIdOrClient: string | AuditLogClient,
    maybeUserId?: string
  ): Promise<number> {
    const client = typeof userIdOrClient === 'string' ? prisma : userIdOrClient
    const userId = typeof userIdOrClient === 'string' ? userIdOrClient : maybeUserId

    if (!userId) {
      throw new Error('userId is required')
    }

    const result = await client.auditLog.updateMany({
      where: {
        userId,
        OR: [
          { ip: { not: null } },
          { userAgent: { not: null } },
        ],
      },
      data: {
        ip: null,
        userAgent: null,
      },
    })
    return result.count
  }
}

// ============================================================================
// VIEW COUNTER ADAPTER
// ============================================================================

/**
 * Input for upserting a total view counter.
 * Used by the views flush route; centralizes Prisma access.
 */
export interface ViewCounterTotalUpsertInput {
  key: string
  namespace: string
  entityId?: string | null
  path?: string | null
  total: number
  increment: number
}

/**
 * Input for upserting a daily view counter.
 */
export interface ViewCounterDailyUpsertInput {
  key: string
  day: Date
  count: number
  increment: number
}

/**
 * Adapter for view counter persistence.
 * Centralizes ViewCounterTotal/ViewCounterDaily writes so callers never access Prisma directly.
 */
export class ViewCounterAdapter {
  /**
   * Upsert a total view counter. Creates or increments by the given delta.
   *
   * @param input - Key, namespace, entityId, path, total (for create), and increment (for update)
   */
  static async upsertTotal(input: ViewCounterTotalUpsertInput): Promise<void> {
    await prisma.viewCounterTotal.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        namespace: input.namespace,
        entityId: input.entityId ?? null,
        path: input.path ?? null,
        total: input.total,
      },
      update: {
        total: { increment: input.increment },
      },
    })
  }

  /**
   * Upsert a daily view counter. Creates or increments by the given delta.
   *
   * @param input - Key, day, count (for create), and increment (for update)
   */
  static async upsertDaily(input: ViewCounterDailyUpsertInput): Promise<void> {
    await prisma.viewCounterDaily.upsert({
      where: { key_day: { key: input.key, day: input.day } },
      create: {
        key: input.key,
        day: input.day,
        count: input.count,
      },
      update: {
        count: { increment: input.increment },
      },
    })
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
  const trimmedNoteId = noteId?.trim()
  if (!trimmedNoteId) return undefined
  
  try {
    const event = await NostrFetchService.fetchEventById(trimmedNoteId)
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

  /**
   * Find lessons by course ID with their associated resources included
   * Avoids N+1 queries by fetching resources in a single query
   */
  static async findByCourseIdWithResources(courseId: string): Promise<(Lesson & { resource?: Resource })[]> {
    const lessons = await prisma.lesson.findMany({
      where: { courseId },
      include: { resource: true },
      orderBy: { index: 'asc' }
    })
    return lessons.map(lesson => ({
      ...transformLesson(lesson),
      resource: lesson.resource ? transformResource(lesson.resource) : undefined
    }))
  }

  /**
   * Count lessons for a course without fetching all data
   * Used for deletion checks to prevent orphaned lessons
   */
  static async countByCourse(courseId: string): Promise<number> {
    return prisma.lesson.count({
      where: { courseId }
    })
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
