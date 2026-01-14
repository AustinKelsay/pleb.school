import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { checkCourseUnlockViaLessons } from '@/lib/course-access'
import { PurchaseAdapter } from '@/lib/db-adapter'

export const dynamic = 'force-dynamic'

// Validation schemas
const paramsSchema = z.object({
  id: z.uuid()
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type LockedLessonsData = {
  locked: true
  id: string
  price: number | null
  noteId: string | null
  createdAt: Date
  user: {
    id: string
    username: string | null
    pubkey: string | null
    lud16: string | null
  }
  isPaid: boolean
  requiresPurchase: true
  unlockedViaCourse: false
  unlockingCourseId: null
}

type LessonSummary = {
  id: string
  courseId: string | null
  index: number
  createdAt: Date
  updatedAt: Date
}

type CourseWithLessons = {
  course: {
    id: string
    userId: string
    price: number | null
    noteId: string | null
  }
  lessons: LessonSummary[]
}

type UnlockedLessonsData = {
  locked: false
  resourceId: string
  lessonCount: number
  courses: CourseWithLessons[]
  lessons: LessonSummary[]
  isPaid: boolean
  requiresPurchase: false
  unlockedViaCourse: boolean
  unlockingCourseId: string | null
}

export type LessonsResponse =
  | { success: true; data: LockedLessonsData }
  | { success: true; data: UnlockedLessonsData }

/**
 * GET /api/resources/[id]/lessons - Get all lessons that use this resource
 *
 * Response shapes (discriminated by `data.locked`):
 *
 * - Locked (paid content without access):
 *   {
 *     "success": true,
 *     "data": {
 *       "locked": true,
 *       "id": "<resource-id>",
 *       "price": 1200,
 *       "noteId": "abcdef...",
 *       "createdAt": "2024-08-01T12:00:00.000Z",
 *       "user": { "id": "...", "username": "...", "pubkey": "...", "lud16": "..." },
 *       "isPaid": true,
 *       "requiresPurchase": true,
 *       "unlockedViaCourse": false,
 *       "unlockingCourseId": null
 *     }
 *   }
 *
 * - Unlocked:
 *   {
 *     "success": true,
 *     "data": {
 *       "locked": false,
 *       "resourceId": "<resource-id>",
 *       "lessonCount": 3,
 *       "courses": [
 *         {
 *           "course": { "id": "<course-id>", "userId": "...", "price": 900, "noteId": "..." },
 *           "lessons": [
 *             { "id": "<lesson-id>", "courseId": "<course-id>", "index": 0, "createdAt": "...", "updatedAt": "..." }
 *           ]
 *         }
 *       ],
 *       "lessons": [
 *         { "id": "<lesson-id>", "courseId": "<course-id>", "index": 0, "createdAt": "...", "updatedAt": "..." }
 *       ],
 *       "isPaid": true,
 *       "requiresPurchase": false,
 *       "unlockedViaCourse": true,
 *       "unlockingCourseId": "<course-id>"
 *     }
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid resource ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if resource exists
    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { 
        id: true,
        userId: true,
        price: true,
        noteId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            pubkey: true,
            lud16: true,
          }
        }
      }
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    // Fetch lessons that use this resource
    const lessons = await prisma.lesson.findMany({
      where: { resourceId: id },
      include: {
        course: {
          select: {
            id: true,
            userId: true,
            price: true,
            noteId: true,
          }
        }
      },
      orderBy: [
        { courseId: 'asc' },
        { index: 'asc' }
      ]
    })

    // Check access permissions for paid content
    const isOwner = session?.user?.id === resource.userId
    const isPaidResource = resource.price > 0
    let courseAccessResult: Awaited<ReturnType<typeof checkCourseUnlockViaLessons>> | null = null

    if (isPaidResource && !isOwner) {
      let hasAccess = false

      if (session?.user?.id) {
        const purchases = await PurchaseAdapter.findByUserAndResource(session.user.id, id)

        const hasPurchasedResource = purchases.some((purchase) => {
          const snapshot = purchase.priceAtPurchase
          const currentPrice = resource.price ?? 0
          const hasSnapshot = snapshot !== null && snapshot !== undefined && snapshot > 0
          const requiredPrice = hasSnapshot
            ? Math.min(snapshot, currentPrice)
            : currentPrice

          return purchase.amountPaid >= requiredPrice
        })

        courseAccessResult = await checkCourseUnlockViaLessons({
          userId: session.user.id,
          resourceId: id,
          lessons
        })

        hasAccess = Boolean(hasPurchasedResource) || courseAccessResult.unlockedViaCourse
      }

      if (!hasAccess) {
        return NextResponse.json({
          success: true,
          data: {
            locked: true,
            id: resource.id,
            price: resource.price,
            noteId: resource.noteId,
            createdAt: resource.createdAt,
            user: resource.user,
            isPaid: true,
            requiresPurchase: true,
            unlockedViaCourse: false,
            unlockingCourseId: null,
          }
        })
      }
    }

    // Group lessons by course for better organization
    const lessonsByCourse = lessons.reduce((acc, lesson) => {
      if (!lesson.course) return acc
      
      const courseId = lesson.course.id
      if (!acc[courseId]) {
        acc[courseId] = {
          course: lesson.course,
          lessons: []
        }
      }
      
      acc[courseId].lessons.push({
        id: lesson.id,
        index: lesson.index,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      })
      
      return acc
    }, {} as Record<string, {
      course: {
        id: string
        userId: string
        price: number | null
        noteId: string | null
      },
      lessons: Array<{
        id: string
        index: number
        createdAt: Date
        updatedAt: Date
      }>
    }>)

    return NextResponse.json({
      success: true,
      data: {
        locked: false,
        resourceId: id,
        lessonCount: lessons.length,
        courses: Object.values(lessonsByCourse),
        lessons: lessons.map(lesson => ({
          id: lesson.id,
          courseId: lesson.courseId,
          index: lesson.index,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
        })),
        isPaid: isPaidResource,
        requiresPurchase: false,
        unlockedViaCourse: courseAccessResult?.unlockedViaCourse ?? false,
        unlockingCourseId: courseAccessResult?.unlockingCourseId ?? null,
      }
    })
  } catch (error) {
    console.error('Failed to fetch resource lessons:', error)
    return NextResponse.json(
      { error: 'Failed to fetch resource lessons' },
      { status: 500 }
    )
  }
}
