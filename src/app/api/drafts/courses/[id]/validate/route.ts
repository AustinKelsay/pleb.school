import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CourseDraftService } from '@/lib/draft-service'
import { PublishService } from '@/lib/publish-service'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const paramsSchema = z.object({
  id: z.uuid()
})

/**
 * POST /api/drafts/courses/[id]/validate - Validate a course draft before publishing
 */
export async function POST(
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

    // Fetch the course draft with lessons
    let courseDraft = await CourseDraftService.findById(id)
    if (!courseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    // Check ownership
    if (courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await CourseDraftService.syncPublishedLessons(id)
    const refreshedCourseDraft = await CourseDraftService.findById(id)
    if (!refreshedCourseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }
    courseDraft = refreshedCourseDraft

    const validation = PublishService.validateCourseDraftData(courseDraft)

    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Validation failed',
          details: validation.errors
        },
        { status: 400 }
      )
    }

    // Validation passed
    return NextResponse.json({
      success: true,
      message: 'Course draft is valid and ready to publish',
      data: {
        courseId: courseDraft.id,
        lessonCount: courseDraft.draftLessons.length,
        draftLessonCount: courseDraft.draftLessons.filter(l => l.draftId).length,
        publishedLessonCount: courseDraft.draftLessons.filter(l => l.resourceId).length
      }
    })
  } catch (error) {
    console.error('Failed to validate course draft:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
