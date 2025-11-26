import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveUniversalId } from '@/lib/universal-router'

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
    const { id } = await params

    const lesson = await resolveLesson(id, lessonInclude)

    if (!lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      )
    }

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
      resource: lesson.resource,
    })
  } catch (error) {
    console.error('Failed to fetch lesson:', error)
    return NextResponse.json(
      { error: 'Failed to fetch lesson' },
      { status: 500 }
    )
  }
}
