import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveUniversalId } from '@/lib/universal-router'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkCourseUnlockViaLessons } from '@/lib/course-access'

interface RouteParams {
  params: Promise<{ id: string }>
}

const lessonInclude = {
  course: {
    select: {
      id: true,
      userId: true,
      price: true,
      noteId: true,
      createdAt: true,
      updatedAt: true,
    }
  },
  resource: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pubkey: true,
          lud16: true,
        }
      }
    }
  }
} satisfies Prisma.LessonInclude

function collectCandidateIdentifiers(rawId: string): string[] {
  const trimmed = rawId.trim()
  const universal = resolveUniversalId(trimmed)
  const candidates = new Set<string>()

  if (trimmed) {
    candidates.add(trimmed)
  }

  if (!universal) {
    return Array.from(candidates)
  }

  if (universal.resolvedId) {
    candidates.add(universal.resolvedId)
  }

  const decoded = universal.decodedData
  if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
    // Use type assertion for dynamic property access
    const data = decoded as unknown as Record<string, unknown>
    const possibleKeys = ['identifier', 'id', 'resource', 'event', 'd']
    for (const key of possibleKeys) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) {
        candidates.add(value.trim())
      }
    }
  }

  return Array.from(candidates)
}

async function findLessonByFlexibleId(identifier: string, include: Prisma.LessonInclude) {
  const lessonById = await prisma.lesson.findUnique({
    where: { id: identifier },
    include,
  })
  if (lessonById) {
    return lessonById
  }

  const lessonByResourceId = await prisma.lesson.findFirst({
    where: { resourceId: identifier },
    include,
  })
  if (lessonByResourceId) {
    return lessonByResourceId
  }

  const lessonByResourceNoteId = await prisma.lesson.findFirst({
    where: {
      resource: {
        noteId: identifier,
      }
    },
    include,
  })
  if (lessonByResourceNoteId) {
    return lessonByResourceNoteId
  }

  return null
}

async function resolveLesson(rawId: string, include: Prisma.LessonInclude) {
  const candidates = collectCandidateIdentifiers(rawId)

  for (const candidate of candidates) {
    const lesson = await findLessonByFlexibleId(candidate, include)
    if (lesson) {
      return lesson
    }
  }

  return null
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    const { id } = await params

    const lesson = await resolveLesson(id, lessonInclude)

    if (!lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      )
    }

    // If no resource attached, return as-is
    if (!lesson.resourceId) {
      return NextResponse.json({
        lesson: {
          id: lesson.id,
          courseId: lesson.courseId,
          resourceId: lesson.resourceId,
          draftId: lesson.draftId,
          index: lesson.index,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
        },
        course: lesson.course,
        resource: null,
      })
    }

    // Fetch resource with access context
    const resource = await prisma.resource.findUnique({
      where: { id: lesson.resourceId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            pubkey: true,
            lud16: true,
          },
        },
        purchases: userId
          ? {
              where: { userId },
              select: { id: true, amountPaid: true, priceAtPurchase: true, createdAt: true, updatedAt: true },
            }
          : false,
        lessons: {
          include: {
            course: {
              select: { id: true, price: true },
            },
          },
        },
      },
    })

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    const isPaid = (resource.price ?? 0) > 0
    const isOwner = userId ? resource.userId === userId : false
    const purchases = Array.isArray(resource.purchases) ? resource.purchases : []

    const hasPurchased = purchases.some((p) => {
      // Align with resources endpoint: only treat snapshot as valid when > 0
      const hasSnapshot = p.priceAtPurchase !== null && p.priceAtPurchase !== undefined && p.priceAtPurchase > 0
      const snapshot = hasSnapshot ? p.priceAtPurchase! : resource.price ?? 0
      const currentPrice = Number.isFinite(resource.price) ? resource.price ?? 0 : 0
      const required = Math.min(snapshot, currentPrice)
      return p.amountPaid >= required
    })

    const lessonsForAccess = resource.lessons.map((lesson) => ({
      courseId: lesson.courseId,
      course: lesson.course ? { id: lesson.course.id, price: lesson.course.price } : null,
    }))

    const courseAccess = await checkCourseUnlockViaLessons({
      userId,
      resourceId: resource.id,
      lessons: lessonsForAccess,
    })

    const unlockedViaCourse = courseAccess.unlockedViaCourse
    const requiresPurchase = Boolean(isPaid && !hasPurchased && !isOwner && !unlockedViaCourse)

    if (requiresPurchase) {
      return NextResponse.json({
        lesson: {
          id: lesson.id,
          courseId: lesson.courseId,
          resourceId: lesson.resourceId,
          draftId: lesson.draftId,
          index: lesson.index,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
        },
        course: lesson.course,
        resource: {
          id: resource.id,
          price: resource.price,
          noteId: resource.noteId,
          createdAt: resource.createdAt,
          user: resource.user,
          isPaid: true,
          requiresPurchase: true,
          unlockedViaCourse,
          unlockingCourseId: courseAccess.unlockingCourseId,
        },
      })
    }

    // Remove purchases from response to keep payload lean
    const { purchases: _omitPurchases, ...resourceSafe } = resource

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        courseId: lesson.courseId,
        resourceId: lesson.resourceId,
        draftId: lesson.draftId,
        index: lesson.index,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      },
      course: lesson.course,
      resource: {
        ...resourceSafe,
        requiresPurchase: false,
        unlockedViaCourse,
        unlockingCourseId: courseAccess.unlockingCourseId,
      },
    })
  } catch (error) {
    console.error('Failed to fetch lesson:', error)
    return NextResponse.json(
      { error: 'Failed to fetch lesson' },
      { status: 500 }
    )
  }
}
