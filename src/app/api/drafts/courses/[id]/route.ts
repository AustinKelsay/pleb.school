import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CourseDraftService } from '@/lib/draft-service'
import { z } from 'zod'

// Validation schemas
const updateCourseDraftSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  summary: z.string().min(1, 'Summary is required').max(1000, 'Summary too long').optional(),
  image: z.url().optional().or(z.literal('')),
  price: z.number().int().min(0).optional(),
  topics: z.array(z.string()).min(1, 'At least one topic is required').optional()
})

const paramsSchema = z.object({
  id: z.uuid({ error: 'Invalid course draft ID' })
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/drafts/courses/[id] - Get a specific course draft
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
        { error: 'Invalid course draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    let courseDraft = await CourseDraftService.findById(id)
    if (!courseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    // Check ownership - users can only access their own drafts
    if (courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await CourseDraftService.syncPublishedLessons(id)
    const syncedCourseDraft = await CourseDraftService.findById(id)
    if (!syncedCourseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }
    courseDraft = syncedCourseDraft

    return NextResponse.json({
      success: true,
      data: courseDraft
    })
  } catch (error) {
    console.error('Failed to fetch course draft:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/drafts/courses/[id] - Update a course draft
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
        { error: 'Invalid course draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if course draft exists and user has access
    const existingDraft = await CourseDraftService.findById(id)
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    if (existingDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = updateCourseDraftSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data
    const courseDraft = await CourseDraftService.update(id, updateData)

    return NextResponse.json({
      success: true,
      data: courseDraft,
      message: 'Course draft updated successfully'
    })
  } catch (error) {
    console.error('Failed to update course draft:', error)
    return NextResponse.json(
      { error: 'Failed to update course draft' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/drafts/courses/[id] - Delete a course draft
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
        { error: 'Invalid course draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if course draft exists and user has access
    const existingDraft = await CourseDraftService.findById(id)
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    if (existingDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await CourseDraftService.delete(id)

    return NextResponse.json({
      success: true,
      message: 'Course draft deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete course draft:', error)
    return NextResponse.json(
      { error: 'Failed to delete course draft' },
      { status: 500 }
    )
  }
}
