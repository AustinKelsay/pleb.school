import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CourseDraftService } from '@/lib/draft-service'
import { getAdminInfo } from '@/lib/admin-utils'
import { z } from 'zod'

// Validation schemas
const createCourseDraftSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  summary: z.string().min(1, 'Summary is required').max(1000, 'Summary too long'),
  image: z.string().url().optional().or(z.literal('')),
  price: z.number().int().min(0).optional(),
  topics: z.array(z.string()).min(1, 'At least one topic is required')
})

const querySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  pageSize: z.string().transform(val => Math.min(parseInt(val) || 10, 50)).optional(),
  userId: z.string().optional()
})

/**
 * GET /api/drafts/courses - Fetch all course drafts
 * Supports pagination and user filtering
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
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      userId: searchParams.get('userId')
    })

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      )
    }

    const { page, pageSize, userId } = queryResult.data

    // Users can only see their own drafts
    const filterUserId = userId || session.user.id

    const result = await CourseDraftService.findAll({
      page,
      pageSize,
      userId: filterUserId
    })

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    })
  } catch (error) {
    console.error('Failed to fetch course drafts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/drafts/courses - Create a new course draft
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
    
    const adminInfo = await getAdminInfo(session)
    if (!adminInfo.isAdmin && !adminInfo.permissions?.createCourse) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = createCourseDraftSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { title, summary, image, price, topics } = validationResult.data

    const courseDraft = await CourseDraftService.create({
      title,
      summary,
      image: image || undefined,
      price,
      topics,
      userId: session.user.id
    })

    return NextResponse.json({
      success: true,
      data: courseDraft,
      message: 'Course draft created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create course draft:', error)
    return NextResponse.json(
      { error: 'Failed to create course draft' },
      { status: 500 }
    )
  }
}
