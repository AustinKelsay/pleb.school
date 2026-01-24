import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { resolveUniversalId } from '@/lib/universal-router'

interface RouteParams {
  params: Promise<{ id: string; lessonId: string }>
}

const lessonInclude = {
  course: true,
  resource: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          pubkey: true,
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

async function findLessonByFlexibleId(identifier: string, courseId: string, include: Prisma.LessonInclude) {
  const lessonById = await prisma.lesson.findUnique({
    where: { id: identifier },
    include,
  })
  if (lessonById && lessonById.courseId === courseId) {
    return lessonById
  }

  const lessonByResourceId = await prisma.lesson.findFirst({
    where: { resourceId: identifier, courseId },
    include,
  })
  if (lessonByResourceId) {
    return lessonByResourceId
  }

  const lessonByResourceNoteId = await prisma.lesson.findFirst({
    where: {
      resource: {
        noteId: identifier,
      },
      courseId,
    },
    include,
  })
  if (lessonByResourceNoteId) {
    return lessonByResourceNoteId
  }

  return null
}

async function resolveLesson(rawId: string, courseId: string, include: Prisma.LessonInclude) {
  const candidates = collectCandidateIdentifiers(rawId)

  for (const candidate of candidates) {
    const lesson = await findLessonByFlexibleId(candidate, courseId, include)
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
    const { id: courseId, lessonId } = await params

    const lesson = await resolveLesson(lessonId, courseId, lessonInclude)

    if (!lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      )
    }

    if (lesson.courseId !== courseId) {
      return NextResponse.json(
        { error: 'Lesson does not belong to this course' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        lesson: {
          id: lesson.id,
          courseId: lesson.courseId,
          resourceId: lesson.resourceId,
          draftId: lesson.draftId,
          index: lesson.index,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt
        },
        course: lesson.course,
        resource: lesson.resource
      }
    })
  } catch (error) {
    console.error('Failed to fetch lesson:', error)
    return NextResponse.json(
      { error: 'Failed to fetch lesson' },
      { status: 500 }
    )
  }
}
