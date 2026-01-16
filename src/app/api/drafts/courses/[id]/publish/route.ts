import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PublishService, type PublishCourseResult } from '@/lib/publish-service'
import { CourseDraftService } from '@/lib/draft-service'
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
  publishedLessonEvents: z.array(z.object({
    id: z.string(),
    pubkey: z.string(),
    created_at: z.number(),
    kind: z.number(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: z.string()
  })).optional(),
  relaySet: z.enum(['default','content','profile','zapThreads']).optional()
})

const paramsSchema = z.object({
  id: z.uuid()
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/drafts/courses/[id]/publish - Publish a course draft to Nostr
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

    const { id: courseDraftId } = paramsResult.data

    // Parse request body
    const body = await request.json()
    const validationResult = publishSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { signedEvent, relays, relaySet, publishedLessonEvents } = validationResult.data

    // If a signed event is provided (NIP-07 flow), handle it differently
    if (signedEvent) {
      // Verify the course draft exists and user owns it
      const courseDraft = await prisma.courseDraft.findUnique({
        where: { id: courseDraftId },
        select: { 
          userId: true,
          draftLessons: {
            include: {
              resource: true,
              draft: true
            },
            orderBy: {
              index: 'asc'
            }
          }
        }
      })

      if (!courseDraft) {
        return NextResponse.json(
          { error: 'Course draft not found' },
          { status: 404 }
        )
      }

      if (courseDraft.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }

      await CourseDraftService.syncPublishedLessons(courseDraftId)

      // Extract note ID from the event
      const dTag = signedEvent.tags.find((tag: string[]) => tag[0] === 'd')
      const noteId = dTag?.[1]

      if (!noteId || noteId !== courseDraftId) {
        return NextResponse.json(
          { error: 'Invalid event: d tag must match course draft ID' },
          { status: 400 }
        )
      }

      // Create course and lessons in database (events already published by client)
      const { course, lessons } = await prisma.$transaction(async (tx) => {
        // Get full course draft details
        const fullCourseDraft = await tx.courseDraft.findUnique({
          where: { id: courseDraftId },
          include: {
            draftLessons: {
              orderBy: {
                index: 'asc'
              }
            }
          }
        })

        if (!fullCourseDraft) {
          throw new Error('Course draft not found')
        }

        // Re-verify ownership inside transaction to prevent TOCTOU race condition
        // This ensures the ownership check is atomic with the write operation
        if (fullCourseDraft.userId !== session.user.id) {
          throw new Error('ACCESS_DENIED')
        }

        // Create the course
        const newCourse = await tx.course.create({
          data: {
            id: courseDraftId,
            userId: fullCourseDraft.userId,
            price: fullCourseDraft.price || 0,
            noteId: signedEvent.id,
            submissionRequired: false,
          }
        })

        // Create lesson records
        const lessonPromises = fullCourseDraft.draftLessons.map(async (draftLesson) => {
          let resourceId: string | undefined
          
          if (draftLesson.draftId) {
            // This was a draft that should have been published
            // For NIP-07 flow, the client publishes lessons and provides the resource IDs
            // The resource ID should match the draft ID after publishing
            resourceId = draftLesson.draftId
            
            // Verify the resource exists
            const resource = await tx.resource.findUnique({
              where: { id: resourceId },
              select: { id: true }
            })
            
            if (!resource) {
              // If resource doesn't exist with draft ID, check if draft still exists
              const draft = await tx.draft.findUnique({
                where: { id: draftLesson.draftId },
                select: { id: true }
              })
              
              if (draft) {
                throw new Error(`Draft lesson ${draftLesson.index} has not been published yet`)
              } else {
                throw new Error(`Resource for draft lesson ${draftLesson.index} not found`)
              }
            }
          } else if (draftLesson.resourceId) {
            // This is an existing resource
            resourceId = draftLesson.resourceId
          }

          if (!resourceId) {
            throw new Error(`Lesson ${draftLesson.index} missing resource reference`)
          }

          return tx.lesson.create({
            data: {
              courseId: newCourse.id,
              resourceId,
              index: draftLesson.index,
            }
          })
        })

        const newLessons = await Promise.all(lessonPromises)

        // Delete draft lessons
        await tx.draftLesson.deleteMany({
          where: { courseDraftId: courseDraftId }
        })

        // Delete the course draft
        await tx.courseDraft.delete({
          where: { id: courseDraftId }
        })

        return { course: newCourse, lessons: newLessons }
      })

      const result: PublishCourseResult = {
        course,
        lessons,
        event: signedEvent as NostrEvent,
        publishedRelays: relays || [],
        publishedLessonEvents: publishedLessonEvents as NostrEvent[] | undefined
      }

      return NextResponse.json({
        success: true,
        data: result,
        message: 'Course published successfully'
      })
    }

    // Server-side publishing flow
    const result = await PublishService.publishCourse(
      courseDraftId,
      session.user.id,
      relays && relays.length ? relays : getRelays(relaySet || 'default')
    )

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Course published successfully'
    })
  } catch (error) {
    console.error('Failed to publish course:', error)
    
    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('DRAFT_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'Course draft not found' },
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
      { error: 'Failed to publish course' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/drafts/courses/[id]/validate - Validate a course draft
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

    const { id: courseDraftId } = paramsResult.data

    let courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }

    if (courseDraft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    await CourseDraftService.syncPublishedLessons(courseDraftId)
    // Re-fetch the course draft after syncPublishedLessons modifies the database
    const refreshedCourseDraft = await CourseDraftService.findById(courseDraftId)
    if (!refreshedCourseDraft) {
      return NextResponse.json(
        { error: 'Course draft not found' },
        { status: 404 }
      )
    }
    courseDraft = refreshedCourseDraft

    const validation = await PublishService.validateCourseDraftData(courseDraft)

    return NextResponse.json({
      success: true,
      data: validation
    })
  } catch (error) {
    console.error('Failed to validate course draft:', error)
    return NextResponse.json(
      { error: 'Failed to validate course draft' },
      { status: 500 }
    )
  }
}
