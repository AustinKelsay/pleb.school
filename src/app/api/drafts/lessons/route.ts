import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { DraftLessonService, CourseDraftService } from '@/lib/draft-service'

// Validation schemas
const createDraftLessonSchema = z.object({
  courseDraftId: z.uuid(),
  resourceId: z.uuid().optional(),
  draftId: z.uuid().optional(),
  index: z.number().int().min(0, 'Index must be a non-negative integer')
}).refine(
  (data) => data.resourceId || data.draftId,
  {
    message: "Either resourceId or draftId must be provided",
    path: ["resourceId"]
  }
)

const querySchema = z.object({
  courseDraftId: z.uuid().optional()
})

/**
 * GET /api/drafts/lessons - Fetch draft lessons
 * Supports filtering by course draft ID
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const queryResult = querySchema.safeParse({
      courseDraftId: searchParams.get('courseDraftId') ?? undefined
    })

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      )
    }

    const { courseDraftId } = queryResult.data

    if (!courseDraftId) {
      return NextResponse.json(
        { error: 'courseDraftId parameter is required' },
        { status: 400 }
      )
    }

    // Check if user has access to the course draft
    const courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    if ( courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const draftLessons = await DraftLessonService.findByCourseDraftId(courseDraftId)

    return NextResponse.json({
      success: true,
      data: draftLessons
    })
  } catch (error) {
    console.error('Failed to fetch draft lessons:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/drafts/lessons - Create a new draft lesson
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validationResult = createDraftLessonSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { courseDraftId, resourceId, draftId, index } = validationResult.data

    // Check if user has access to the course draft
    const courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    if ( courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const draftLesson = await DraftLessonService.create({
      courseDraftId,
      resourceId,
      draftId,
      index
    })

    return NextResponse.json({
      success: true,
      data: draftLesson,
      message: 'Draft lesson created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create draft lesson:', error)
    
    // Handle unique constraint violations with specific messaging
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const targetMeta = error.meta?.target
      const target = Array.isArray(targetMeta) ? (targetMeta as string[]) : []

      if (target.includes('courseDraftId') && target.includes('index')) {
        return NextResponse.json(
          { error: 'A lesson with this index already exists in the course draft' },
          { status: 409 }
        )
      }

      if (target.includes('courseDraftId') && target.includes('resourceId')) {
        return NextResponse.json(
          { error: 'This resource is already included in the course draft' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: 'A unique constraint was violated while creating the draft lesson' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create draft lesson' },
      { status: 500 }
    )
  }
}
