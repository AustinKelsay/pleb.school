import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CourseDraftService, DraftService, CourseDraftWithIncludes, DraftWithIncludes } from '@/lib/draft-service'
import { z } from 'zod'

// Types for enhanced drafts
type EnhancedCourseDraft = CourseDraftWithIncludes & {
  draftType: 'course'
  category: string
  lessonCount: number
}

type EnhancedResourceDraft = DraftWithIncludes & {
  draftType: 'resource'
  category: string
}

type CombinedDraft = EnhancedCourseDraft | EnhancedResourceDraft

// Validation schema
const querySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  pageSize: z.string().transform(val => Math.min(parseInt(val) || 10, 50)).optional(),
  userId: z.string().optional(),
  type: z.enum(['course', 'resource', 'all']).optional()
})

/**
 * GET /api/drafts - Fetch all drafts (courses and resources combined)
 * Supports pagination, user filtering, and type filtering
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
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
      userId: searchParams.get('userId') || undefined,
      type: searchParams.get('type') || undefined
    })

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      )
    }

    const { page, pageSize, userId, type } = queryResult.data

    // Users can only see their own drafts
    const filterUserId = session.user.id

    const options = {
      page,
      pageSize,
      userId: filterUserId
    }

    // Fetch data based on type filter
    let courseDrafts: EnhancedCourseDraft[] = []
    let resourceDrafts: EnhancedResourceDraft[] = []
    let totalCount = 0

    // Always fetch total counts for stats
    const allCourseResult = await CourseDraftService.findAll({ ...options, pageSize: 1000 })
    const allResourceResult = await DraftService.findAll({ ...options, pageSize: 1000 })
    const totalCoursesCount = allCourseResult.pagination.totalItems
    const totalResourcesCount = allResourceResult.pagination.totalItems

    if (type === 'course' || type === 'all' || !type) {
      const courseResult = await CourseDraftService.findAll(options)
      courseDrafts = courseResult.data.map(draft => ({
        ...draft,
        draftType: 'course',
        category: draft.topics[0] || 'general',
        lessonCount: draft.draftLessons?.length || 0
      }))
      if (type === 'course') {
        totalCount = courseResult.pagination.totalItems
      }
    }

    if (type === 'resource' || type === 'all' || !type) {
      const resourceResult = await DraftService.findAll(options)
      resourceDrafts = resourceResult.data.map(draft => ({
        ...draft,
        draftType: 'resource',
        category: draft.topics[0] || 'general'
      }))
      if (type === 'resource') {
        totalCount = resourceResult.pagination.totalItems
      }
    }

    // Combine and sort by updatedAt for 'all' type
    let combinedDrafts: CombinedDraft[] = []
    if (type === 'all' || !type) {
      combinedDrafts = [...courseDrafts, ...resourceDrafts]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      
      // Manual pagination for combined results
      const startIndex = (page! - 1) * pageSize!
      const endIndex = startIndex + pageSize!
      combinedDrafts = combinedDrafts.slice(startIndex, endIndex)
      totalCount = courseDrafts.length + resourceDrafts.length
    } else {
      combinedDrafts = type === 'course' ? courseDrafts : resourceDrafts
    }

    // Create pagination info
    const pagination = {
      page: page!,
      pageSize: pageSize!,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / pageSize!),
      hasNext: page! < Math.ceil(totalCount / pageSize!),
      hasPrev: page! > 1
    }

    // Get summary statistics - always show total counts regardless of filter
    const stats = {
      totalCourses: totalCoursesCount,
      totalResources: totalResourcesCount,
      totalDrafts: totalCoursesCount + totalResourcesCount,
      premiumDrafts: [...allCourseResult.data, ...allResourceResult.data].filter(draft => (draft.price || 0) > 0).length,
      freeDrafts: [...allCourseResult.data, ...allResourceResult.data].filter(draft => (draft.price || 0) === 0).length
    }

    return NextResponse.json({
      success: true,
      data: combinedDrafts,
      pagination,
      stats
    })
  } catch (error) {
    console.error('Failed to fetch drafts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
