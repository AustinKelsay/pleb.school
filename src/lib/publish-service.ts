/**
 * Publish Service - Handles publishing drafts to Nostr and database
 * 
 * This service manages the complete publishing workflow:
 * 1. Fetching draft content
 * 2. Creating and signing Nostr events
 * 3. Publishing to relays
 * 4. Creating database records
 * 5. Cleaning up drafts
 * 
 * All operations are wrapped in database transactions for atomicity
 */

import { prisma } from '@/lib/prisma'
import { RelayPool, type NostrEvent } from 'snstr'
import { DEFAULT_RELAYS, getRelays } from './nostr-relays'
import { 
  createResourceEvent, 
  createCourseEvent,
  extractNoteId
} from '@/lib/nostr-events'
import { DraftService, CourseDraftService, type CourseDraftWithIncludes } from '@/lib/draft-service'
import type { Resource, Course, Lesson } from '@prisma/client'
import { decryptPrivkey } from './privkey-crypto'

// Default relays for publishing are loaded from config via DEFAULT_RELAYS

/**
 * Publishing result types
 */
export interface PublishResourceResult {
  resource: Resource
  event: NostrEvent
  publishedRelays: string[]
}

export interface PublishCourseResult {
  course: Course
  lessons: Lesson[]
  event: NostrEvent
  publishedRelays: string[]
  publishedLessonEvents?: NostrEvent[]
}

/**
 * Publishing error with details
 */
export class PublishError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'PublishError'
  }
}

/**
 * Publish Service
 */
export class PublishService {
  /**
   * Publish a resource draft to Nostr
   */
  static async publishResource(
    draftId: string,
    userId: string,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<PublishResourceResult> {
    // Fetch the draft with user info
    const draft = await DraftService.findById(draftId)
    if (!draft) {
      throw new PublishError('Draft not found', 'DRAFT_NOT_FOUND')
    }

    // Verify ownership
    if (draft.userId !== userId) {
      throw new PublishError('Access denied', 'ACCESS_DENIED')
    }

    // Check if user has a private key (required for server-side signing)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { privkey: true, pubkey: true }
    })

    if (!user) {
      throw new PublishError('User not found', 'USER_NOT_FOUND')
    }

    // Use the stored server-side key for signing (ephemeral/OAuth accounts only)
    const signingPrivkey = decryptPrivkey(user.privkey)
    if (!signingPrivkey) {
      throw new PublishError(
        'Private key not available for signing',
        'PRIVKEY_NOT_AVAILABLE'
      )
    }

    try {
      // Ensure this draft isn't reused multiple times in the same course draft
      const draftLessonUsages = await prisma.draftLesson.findMany({
        where: { draftId },
        select: { id: true, courseDraftId: true },
      })

      const duplicateCourseUsage = draftLessonUsages.reduce<Map<string, string[]>>((acc, lesson) => {
        const existing = acc.get(lesson.courseDraftId) || []
        existing.push(lesson.id)
        acc.set(lesson.courseDraftId, existing)
        return acc
      }, new Map())

      for (const [courseDraftId, lessonIds] of duplicateCourseUsage.entries()) {
        if (lessonIds.length > 1) {
          throw new PublishError(
            'A course draft contains this draft multiple times. Duplicate lessons must be removed before publishing this resource.',
            'DUPLICATE_DRAFT_LESSONS',
            { courseDraftId, lessonIds }
          )
        }
      }

      // Create and sign the Nostr event
      const event = createResourceEvent(draft, signingPrivkey)
      
      // Extract the note ID from the event
      const noteId = extractNoteId(event)
      if (!noteId) {
        throw new PublishError('Failed to extract note ID from event', 'INVALID_EVENT')
      }

      // Publish to relays
      const relayPool = new RelayPool(relays && relays.length ? relays : getRelays('default'))
      const publishPromises = relayPool.publish(relays, event)
      const publishResults = await Promise.allSettled(publishPromises)
      
      // Check which relays succeeded
      const publishedRelays: string[] = []
      publishResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          publishedRelays.push(relays[index])
        }
      })

      if (publishedRelays.length === 0) {
        throw new PublishError(
          'Failed to publish to any relay',
          'RELAY_PUBLISH_FAILED',
          { results: publishResults }
        )
      }

      // Create resource in database (wrapped in transaction)
      const resource = await prisma.$transaction(async (tx) => {
        // Create the resource
        const newResource = await tx.resource.create({
          data: {
            id: draft.id, // Use draft ID as resource ID
            userId: draft.userId,
            price: draft.price || 0,
            noteId: event.id, // Store the Nostr event ID
            videoId: draft.type === 'video' ? draft.id : undefined,
            videoUrl: draft.type === 'video' ? draft.videoUrl ?? null : null,
          }
        })

        await tx.draftLesson.updateMany({
          where: { draftId: draft.id },
          data: {
            resourceId: newResource.id,
            draftId: null,
            updatedAt: new Date(),
          },
        })

        // If this draft was used in any lessons, update them
        await tx.lesson.updateMany({
          where: { draftId: draft.id },
          data: { 
            resourceId: newResource.id,
            draftId: null 
          }
        })

        // Delete the draft
        await tx.draft.delete({
          where: { id: draft.id }
        })

        return newResource
      })

      return {
        resource,
        event,
        publishedRelays
      }
    } catch (error) {
      if (error instanceof PublishError) {
        throw error
      }
      throw new PublishError(
        'Failed to publish resource',
        'PUBLISH_FAILED',
        { error: error instanceof Error ? error.message : error }
      )
    }
  }

  /**
   * Publish a course draft to Nostr
   * This includes publishing any unpublished lesson drafts first
   */
  static async publishCourse(
    courseDraftId: string,
    userId: string,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<PublishCourseResult> {
    // Fetch the course draft with lessons
    let courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      throw new PublishError('Course draft not found', 'DRAFT_NOT_FOUND')
    }

    // Verify ownership
    if (courseDraft.userId !== userId) {
      throw new PublishError('Access denied', 'ACCESS_DENIED')
    }

    await CourseDraftService.syncPublishedLessons(courseDraftId)
    courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      throw new PublishError('Course draft not found', 'DRAFT_NOT_FOUND')
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        privkey: true, 
        pubkey: true
      }
    })

    if (!user || !user.pubkey) {
      throw new PublishError('User not found', 'USER_NOT_FOUND')
    }

    const signingPrivkey = decryptPrivkey(user.privkey)
    if (!signingPrivkey) {
      throw new PublishError(
        'Private key not available for signing',
        'PRIVKEY_NOT_AVAILABLE'
      )
    }

    try {
      // First, publish any draft lessons that aren't already published
      const publishedLessonEvents: NostrEvent[] = []
      const lessonReferences: Array<{ resourceId: string; pubkey: string }> = []

      // Process each lesson
      for (const draftLesson of courseDraft.draftLessons) {
        if (draftLesson.draftId && draftLesson.draft) {
          // This is an unpublished draft - publish it first
          const result = await this.publishResource(
            draftLesson.draftId,
            userId,
            relays
          )
          publishedLessonEvents.push(result.event)
          lessonReferences.push({
            resourceId: result.resource.id,
            pubkey: user.pubkey
          })
        } else if (draftLesson.resourceId) {
          // This is an already published resource
          const resource = await prisma.resource.findUnique({
            where: { id: draftLesson.resourceId },
            include: { user: { select: { pubkey: true } } }
          })
          if (resource && resource.user.pubkey) {
            lessonReferences.push({
              resourceId: resource.id,
              pubkey: resource.user.pubkey
            })
          }
        }
      }

      // Create and sign the course event
      const courseEvent = createCourseEvent(
        courseDraft,
        lessonReferences,
        signingPrivkey
      )

      // Extract the note ID
      const noteId = extractNoteId(courseEvent)
      if (!noteId) {
        throw new PublishError('Failed to extract note ID from event', 'INVALID_EVENT')
      }

      // Publish course event to relays
      const relayPool = new RelayPool(relays && relays.length ? relays : getRelays('default'))
      const publishPromises = relayPool.publish(relays, courseEvent)
      const publishResults = await Promise.allSettled(publishPromises)
      
      const publishedRelays: string[] = []
      publishResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          publishedRelays.push(relays[index])
        }
      })

      if (publishedRelays.length === 0) {
        throw new PublishError(
          'Failed to publish course to any relay',
          'RELAY_PUBLISH_FAILED',
          { results: publishResults }
        )
      }

      // Create course and lessons in database (wrapped in transaction)
      const { course, lessons } = await prisma.$transaction(async (tx) => {
        // Create the course
        const newCourse = await tx.course.create({
          data: {
            id: courseDraft.id, // Use draft ID as course ID
            userId: courseDraft.userId,
            price: courseDraft.price || 0,
            noteId: courseEvent.id,
            submissionRequired: false,
          }
        })

        // Create lesson records
        const lessonPromises = courseDraft.draftLessons.map(async (draftLesson, index) => {
          // Determine the resource ID (either from draft that was just published or existing)
          let resourceId: string | undefined
          
          if (draftLesson.draftId) {
            // This was a draft that we just published
            resourceId = draftLesson.draftId
          } else if (draftLesson.resourceId) {
            // This is an existing resource
            resourceId = draftLesson.resourceId
          }

          if (!resourceId) {
            throw new PublishError(
              'Lesson missing resource reference',
              'INVALID_LESSON',
              { lessonIndex: index }
            )
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
          where: { courseDraftId: courseDraft.id }
        })

        // Delete the course draft
        await tx.courseDraft.delete({
          where: { id: courseDraft.id }
        })

        return { course: newCourse, lessons: newLessons }
      })

      return {
        course,
        lessons,
        event: courseEvent,
        publishedRelays,
        publishedLessonEvents: publishedLessonEvents.length > 0 ? publishedLessonEvents : undefined
      }
    } catch (error) {
      if (error instanceof PublishError) {
        throw error
      }
      throw new PublishError(
        'Failed to publish course',
        'PUBLISH_FAILED',
        { error: error instanceof Error ? error.message : error }
      )
    }
  }

  /**
   * Validate that a draft is ready for publishing
   */
  static async validateResourceDraft(draftId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    const draft = await DraftService.findById(draftId)
    if (!draft) {
      return { valid: false, errors: ['Draft not found'] }
    }

    // Validate required fields
    if (!draft.title || draft.title.trim().length === 0) {
      errors.push('Title is required')
    }
    if (!draft.summary || draft.summary.trim().length === 0) {
      errors.push('Summary is required')
    }

    const hasContent = !!draft.content && draft.content.trim().length > 0
    const isVideoDraft = draft.type === 'video'
    const hasVideoUrl = !!draft.videoUrl && draft.videoUrl.trim().length > 0

    if (isVideoDraft) {
      if (!hasVideoUrl) {
        errors.push('Video URL is required for video drafts')
      }
    } else if (!hasContent) {
      errors.push('Content is required')
    }

    if (!draft.topics || draft.topics.length === 0) {
      errors.push('At least one topic is required')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validate that a course draft is ready for publishing
   */
  static validateCourseDraftData(courseDraft: CourseDraftWithIncludes): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate required fields
    if (!courseDraft.title || courseDraft.title.trim().length === 0) {
      errors.push('Title is required')
    }
    if (!courseDraft.summary || courseDraft.summary.trim().length === 0) {
      errors.push('Summary is required')
    }
    if (!courseDraft.topics || courseDraft.topics.length === 0) {
      errors.push('At least one topic is required')
    }
    if (!courseDraft.draftLessons || courseDraft.draftLessons.length === 0) {
      errors.push('At least one lesson is required')
    }

    // Validate lessons
    const resourceUsage = new Map<string, number[]>()
    const draftUsage = new Map<string, number[]>()

    courseDraft.draftLessons.forEach((lesson, index) => {
      const lessonNumber = index + 1
      if (!lesson.resourceId && !lesson.draftId) {
        errors.push(`Lesson ${lessonNumber} has no content attached`)
        return
      }

      if (lesson.draft) {
        const { title, summary, content, type, videoUrl } = lesson.draft
        if (!title || title.trim().length === 0) {
          errors.push(`Lesson ${lessonNumber} draft is missing a title`)
        }
        if (!summary || summary.trim().length === 0) {
          errors.push(`Lesson ${lessonNumber} draft is missing a summary`)
        }

        const hasContent = !!content && content.trim().length > 0
        const isVideoDraft = type === 'video'
        const hasVideoUrl = !!videoUrl && videoUrl.trim().length > 0

        if (isVideoDraft) {
          if (!hasVideoUrl) {
            errors.push(`Lesson ${lessonNumber} draft is missing a video URL`)
          }
        } else if (!hasContent) {
          errors.push(`Lesson ${lessonNumber} draft is missing content`)
        }
      }

      if (lesson.resourceId) {
        const existing = resourceUsage.get(lesson.resourceId) ?? []
        existing.push(lessonNumber)
        resourceUsage.set(lesson.resourceId, existing)
      }

      if (lesson.draftId) {
        const existingDraft = draftUsage.get(lesson.draftId) ?? []
        existingDraft.push(lessonNumber)
        draftUsage.set(lesson.draftId, existingDraft)
      }
    })

    const indices = courseDraft.draftLessons.map((lesson) => lesson.index)
    const uniqueIndices = new Set(indices)
    if (uniqueIndices.size !== indices.length) {
      errors.push('Duplicate lesson indices found')
    }

    resourceUsage.forEach((lessonNumbers) => {
      if (lessonNumbers.length > 1) {
        errors.push(`Lessons ${lessonNumbers.join(', ')} reference the same published resource`)
      }
    })

    draftUsage.forEach((lessonNumbers) => {
      if (lessonNumbers.length > 1) {
        errors.push(`Lessons ${lessonNumbers.join(', ')} reuse the same draft content`)
      }
    })

    return {
      valid: errors.length === 0,
      errors
    }
  }

  static async validateCourseDraft(courseDraftId: string): Promise<{ valid: boolean; errors: string[] }> {
    const courseDraft = await CourseDraftService.findById(courseDraftId)
    if (!courseDraft) {
      return { valid: false, errors: ['Course draft not found'] }
    }

    return this.validateCourseDraftData(courseDraft)
  }
}
