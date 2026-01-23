import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@/generated/prisma'
import { authOptions } from '@/lib/auth'
import { DraftLessonService } from '@/lib/draft-service'
import { z } from 'zod'

// Validation schemas
const updateDraftLessonSchema = z.object({
  index: z.number().int().min(0, 'Index must be a non-negative integer').optional()
})

const paramsSchema = z.object({
  id: z.uuid()
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/drafts/lessons/[id] - Get a specific draft lesson
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid draft lesson ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    const draftLesson = await DraftLessonService.findById(id)
    if (!draftLesson) {
      return NextResponse.json(
        { error: 'Draft lesson not found' },
        { status: 404 }
      )
    }

    // Check ownership through course draft
    if ( draftLesson.courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: draftLesson
    })
  } catch (error) {
    console.error('Failed to fetch draft lesson:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/drafts/lessons/[id] - Update a draft lesson
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid draft lesson ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if draft lesson exists and user has access
    const existingDraftLesson = await DraftLessonService.findById(id)
    if (!existingDraftLesson) {
      return NextResponse.json(
        { error: 'Draft lesson not found' },
        { status: 404 }
      )
    }

    if ( existingDraftLesson.courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = updateDraftLessonSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data
    const draftLesson = await DraftLessonService.update(id, updateData)

    return NextResponse.json({
      success: true,
      data: draftLesson,
      message: 'Draft lesson updated successfully'
    })
  } catch (error) {
    console.error('Failed to update draft lesson:', error)
    
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
        { error: 'A unique constraint was violated while updating the draft lesson' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update draft lesson' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/drafts/lessons/[id] - Delete a draft lesson
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const paramsResult = paramsSchema.safeParse(resolvedParams)

    if (!paramsResult.success) {
      return NextResponse.json(
        { error: 'Invalid draft lesson ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if draft lesson exists and user has access
    const existingDraftLesson = await DraftLessonService.findById(id)
    if (!existingDraftLesson) {
      return NextResponse.json(
        { error: 'Draft lesson not found' },
        { status: 404 }
      )
    }

    if ( existingDraftLesson.courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await DraftLessonService.delete(id)

    return NextResponse.json({
      success: true,
      message: 'Draft lesson deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete draft lesson:', error)
    return NextResponse.json(
      { error: 'Failed to delete draft lesson' },
      { status: 500 }
    )
  }
}
