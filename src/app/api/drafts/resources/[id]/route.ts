import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DraftService } from '@/lib/draft-service'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import { z } from 'zod'

const additionalLinkSchema = z.object({
  url: z.string().url('Link must be a valid URL'),
  title: z.string().trim().min(1).max(120).optional(),
})

const additionalLinksSchema = z
  .array(z.union([z.string().url(), additionalLinkSchema]))
  .optional()

// Validation schemas
const updateDraftSchema = z.object({
  type: z.enum(['document', 'video']).optional(),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').optional(),
  summary: z.string().min(1, 'Summary is required').max(1000, 'Summary too long').optional(),
  content: z.string().optional(),
  image: z.string().url().optional().or(z.literal('')).optional(),
  price: z.number().int().min(0).optional(),
  topics: z.array(z.string()).min(1, 'At least one topic is required').optional(),
  additionalLinks: additionalLinksSchema,
  videoUrl: z.string().url().optional()
})

const paramsSchema = z.object({
  id: z.string().uuid('Invalid draft ID')
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/drafts/resources/[id] - Get a specific resource draft
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
        { error: 'Invalid draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    const draft = await DraftService.findById(id)
    if (!draft) {
      return NextResponse.json(
        { error: 'Resource draft not found' },
        { status: 404 }
      )
    }

    // Check ownership - users can only access their own drafts unless admin
    if ( draft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: draft
    })
  } catch (error) {
    console.error('Failed to fetch resource draft:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/drafts/resources/[id] - Update a resource draft
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
        { error: 'Invalid draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if draft exists and user has access
    const existingDraft = await DraftService.findById(id)
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'Resource draft not found' },
        { status: 404 }
      )
    }

    if ( existingDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = updateDraftSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const updateData = validationResult.data
    const { additionalLinks, ...restUpdateData } = updateData
    const normalizedLinks =
      additionalLinks !== undefined ? normalizeAdditionalLinks(additionalLinks) : undefined
    const updatePayload = {
      ...restUpdateData,
      ...(normalizedLinks !== undefined ? { additionalLinks: normalizedLinks } : {}),
    }

    const effectiveType = updatePayload.type ?? existingDraft.type
    const effectiveVideoUrl = updatePayload.videoUrl ?? existingDraft.videoUrl

    if (effectiveType === 'video' && !effectiveVideoUrl) {
      return NextResponse.json(
        { error: 'Video URL is required for video content' },
        { status: 400 }
      )
    }

    if (effectiveType !== 'video') {
      const effectiveContent = updateData.content ?? existingDraft.content
      if (!effectiveContent || !effectiveContent.trim()) {
        return NextResponse.json(
          { error: 'Content is required for non-video resources' },
          { status: 400 }
        )
      }
    }

    const draft = await DraftService.update(id, updatePayload)

    return NextResponse.json({
      success: true,
      data: draft,
      message: 'Resource draft updated successfully'
    })
  } catch (error) {
    console.error('Failed to update resource draft:', error)
    return NextResponse.json(
      { error: 'Failed to update resource draft' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/drafts/resources/[id] - Delete a resource draft
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
        { error: 'Invalid draft ID' },
        { status: 400 }
      )
    }

    const { id } = paramsResult.data

    // Check if draft exists and user has access
    const existingDraft = await DraftService.findById(id)
    if (!existingDraft) {
      return NextResponse.json(
        { error: 'Resource draft not found' },
        { status: 404 }
      )
    }

    if ( existingDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await DraftService.delete(id)

    return NextResponse.json({
      success: true,
      message: 'Resource draft deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete resource draft:', error)
    return NextResponse.json(
      { error: 'Failed to delete resource draft' },
      { status: 500 }
    )
  }
}
