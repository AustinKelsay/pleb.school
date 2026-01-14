import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DraftLessonService, CourseDraftService } from '@/lib/draft-service'
import { z } from 'zod'

// Validation schema
const reorderLessonsSchema = z.object({
  courseDraftId: z.uuid(),
  lessonIds: z.array(z.uuid()).min(1, 'At least one lesson ID is required')
})

/**
 * PUT /api/drafts/lessons/reorder - Reorder draft lessons within a course draft
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validationResult = reorderLessonsSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { courseDraftId, lessonIds } = validationResult.data

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

    // Verify all lesson IDs belong to the course draft
    const existingLessons = await DraftLessonService.findByCourseDraftId(courseDraftId)
    const existingLessonIds = existingLessons.map(lesson => lesson.id)
    
    const invalidLessonIds = lessonIds.filter(id => !existingLessonIds.includes(id))
    if (invalidLessonIds.length > 0) {
      return NextResponse.json(
        { error: 'Some lesson IDs do not belong to this course draft', invalidIds: invalidLessonIds },
        { status: 400 }
      )
    }

    // Check if all lessons are included
    if (lessonIds.length !== existingLessonIds.length) {
      return NextResponse.json(
        { error: 'All lessons must be included in the reorder operation' },
        { status: 400 }
      )
    }

    // Reorder the lessons
    const updatedLessons = await DraftLessonService.reorder(courseDraftId, lessonIds)

    return NextResponse.json({
      success: true,
      data: updatedLessons,
      message: 'Draft lessons reordered successfully'
    })
  } catch (error) {
    console.error('Failed to reorder draft lessons:', error)
    return NextResponse.json(
      { error: 'Failed to reorder draft lessons' },
      { status: 500 }
    )
  }
}