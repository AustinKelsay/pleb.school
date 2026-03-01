import { NextRequest, NextResponse } from 'next/server'
import { LessonAdapter } from '@/lib/db-adapter'

/**
 * GET /api/courses/[id]/lessons
 * Returns all lessons for a course with their resources, regardless of purchase status.
 * Used for course structure preview so users can see lesson titles and premium/free
 * badges before buying. Does not gate on purchase (unlike /api/courses/[id]).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lessons = await LessonAdapter.findByCourseIdWithResources(id)

    return NextResponse.json({ lessons })
  } catch (error) {
    console.error('Error fetching course lessons:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}