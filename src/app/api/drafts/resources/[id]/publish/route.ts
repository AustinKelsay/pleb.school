import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PublishService, type PublishResourceResult } from '@/lib/publish-service'
import { z } from 'zod'
import { getRelays } from '@/lib/nostr-relays'
import { prisma } from '@/lib/prisma'
import type { NostrEvent } from 'snstr'

// Validation schemas
const publishSchema = z.object({
  signedEvent: z.object({
    id: z.string(),
    pubkey: z.string(),
    created_at: z.number(),
    kind: z.number(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: z.string()
  }).optional(),
  relays: z.array(z.string()).optional(),
  relaySet: z.enum(['default','content','profile','zapThreads']).optional()
})

const paramsSchema = z.object({
  id: z.uuid()
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/drafts/resources/[id]/publish - Publish a resource draft to Nostr
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
        { error: 'Invalid draft ID' },
        { status: 400 }
      )
    }

    const { id: draftId } = paramsResult.data

    // Parse request body
    const body = await request.json()
    const validationResult = publishSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { signedEvent, relays, relaySet } = validationResult.data

    // If a signed event is provided (NIP-07 flow), handle it differently
    if (signedEvent) {
      // Verify the draft exists and user owns it
      const draft = await prisma.draft.findUnique({
        where: { id: draftId },
        select: { userId: true }
      })

      if (!draft) {
        return NextResponse.json(
          { error: 'Draft not found' },
          { status: 404 }
        )
      }

      if (draft.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }

      // Extract note ID from the event
      const dTag = signedEvent.tags.find((tag: string[]) => tag[0] === 'd')
      const noteId = dTag?.[1]

      if (!noteId || noteId !== draftId) {
        return NextResponse.json(
          { error: 'Invalid event: d tag must match draft ID' },
          { status: 400 }
        )
      }

      // Ensure this draft isn't reused multiple times in the same course draft
      const draftLessonUsages = await prisma.draftLesson.findMany({
        where: { draftId },
        select: { id: true, courseDraftId: true },
      })

      const duplicateCourseUsage = draftLessonUsages.reduce<Map<string, string[]>>((acc, lesson) => {
        const courseDraftId = lesson.courseDraftId
        if (!courseDraftId) {
          return acc
        }

        const existing = acc.get(courseDraftId) ?? []
        existing.push(lesson.id)
        acc.set(courseDraftId, existing)
        return acc
      }, new Map())

      for (const [courseDraftId, lessonIds] of duplicateCourseUsage.entries()) {
        if (lessonIds.length > 1) {
          return NextResponse.json(
            {
              error: 'Duplicate draft lessons detected',
              details: [
                'A course draft contains this draft multiple times. Remove duplicates before publishing this resource.'
              ],
              meta: { courseDraftId, lessonIds }
            },
            { status: 400 }
          )
        }
      }

      // Create resource in database (the event is already published by client)
      const resource = await prisma.$transaction(async (tx) => {
        // Get the draft details for creating resource
        const fullDraft = await tx.draft.findUnique({
          where: { id: draftId }
        })

        if (!fullDraft) {
          throw new Error('Draft not found')
        }

        // Create the resource
        const newResource = await tx.resource.create({
          data: {
            id: draftId,
            userId: fullDraft.userId,
            price: fullDraft.price || 0,
            noteId: signedEvent.id,
            videoId: fullDraft.type === 'video' ? draftId : undefined,
            videoUrl: fullDraft.type === 'video' ? fullDraft.videoUrl ?? undefined : undefined,
          }
        })

        await tx.draftLesson.updateMany({
          where: { draftId },
          data: {
            resourceId: newResource.id,
            draftId: null,
            updatedAt: new Date(),
          },
        })

        // Update any lessons using this draft
        await tx.lesson.updateMany({
          where: { draftId: draftId },
          data: { 
            resourceId: newResource.id,
            draftId: null 
          }
        })

        // Delete the draft
        await tx.draft.delete({
          where: { id: draftId }
        })

        return newResource
      })

      const result: PublishResourceResult = {
        resource,
        event: signedEvent as NostrEvent,
        publishedRelays: relays || []
      }

      return NextResponse.json({
        success: true,
        data: result,
        message: 'Resource published successfully'
      })
    }

    // Server-side publishing flow
    const result = await PublishService.publishResource(
      draftId,
      session.user.id,
      relays && relays.length ? relays : getRelays(relaySet || 'default')
    )

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Resource published successfully'
    })
  } catch (error) {
    console.error('Failed to publish resource:', error)
    
    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('DRAFT_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'Draft not found' },
          { status: 404 }
        )
      }
      if (error.message.includes('ACCESS_DENIED')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
      if (error.message.includes('PRIVKEY_NOT_AVAILABLE')) {
        return NextResponse.json(
          { error: 'Private key required for publishing' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to publish resource' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/drafts/resources/[id]/validate - Validate a resource draft
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

    const { id: draftId } = paramsResult.data

    // Validate the draft
    const validation = await PublishService.validateResourceDraft(draftId)

    return NextResponse.json({
      success: true,
      data: validation
    })
  } catch (error) {
    console.error('Failed to validate draft:', error)
    return NextResponse.json(
      { error: 'Failed to validate draft' },
      { status: 500 }
    )
  }
}
