import { prisma } from '@/lib/prisma'
import { getRelays, type RelaySet } from '@/lib/nostr-relays'
import {
  createCourseEvent,
  createResourceEvent,
  extractNoteId,
  type CourseEventDraftInput,
  type ResourceEventDraftInput,
} from '@/lib/nostr-events'
import { parseCourseEvent, parseEvent } from '@/data/types'
import type { Course, Resource } from '@prisma/client'
import { RelayPool, type NostrEvent } from 'snstr'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import type { AdditionalLink } from '@/types/additional-links'

export class RepublishError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'RepublishError'
  }
}

interface BaseRepublishOptions {
  relays?: string[]
  relaySet?: RelaySet
  signedEvent?: NostrEvent
  privkey?: string
}

export interface RepublishResourceOptions extends BaseRepublishOptions {
  title: string
  summary: string
  content: string
  price: number
  image?: string
  topics: string[]
  additionalLinks: AdditionalLink[]
  type: 'document' | 'video'
  videoUrl?: string
}

export interface RepublishCourseOptions extends BaseRepublishOptions {
  title: string
  summary: string
  image?: string
  price: number
  topics: string[]
}

interface PublishOutcome {
  event: NostrEvent
  noteId: string
  publishedRelays: string[]
  mode: 'server-sign' | 'signed-event'
}

async function publishToRelays(relays: string[], event: NostrEvent): Promise<string[]> {
  if (!relays || relays.length === 0) {
    throw new RepublishError('No relays configured for publishing', 'NO_RELAYS')
  }

  const relayPool = new RelayPool(relays)
  const publishResults = await Promise.allSettled(relayPool.publish(relays, event))

  const successfulRelays: string[] = []
  publishResults.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      successfulRelays.push(relays[idx])
    }
  })

  if (successfulRelays.length === 0) {
    throw new RepublishError('Failed to publish event to relays', 'RELAY_PUBLISH_FAILED', {
      results: publishResults,
    })
  }

  return successfulRelays
}

async function assertActorCanManageResource(resource: Resource & { user: { id: string } }, actorId: string) {
  if (resource.userId === actorId) {
    return
  }

  const actingUser = await prisma.user.findUnique({
    where: { id: actorId },
    include: { role: true },
  })

  if (!actingUser) {
    throw new RepublishError('Acting user not found', 'ACTOR_NOT_FOUND')
  }

  if (!actingUser?.role?.admin) {
    throw new RepublishError('Access denied', 'FORBIDDEN')
  }
}

async function assertActorCanManageCourse(course: Course & { user: { id: string } }, actorId: string) {
  if (course.userId === actorId) {
    return
  }

  const actingUser = await prisma.user.findUnique({
    where: { id: actorId },
    include: { role: true },
  })

  if (!actingUser) {
    throw new RepublishError('Acting user not found', 'ACTOR_NOT_FOUND')
  }

  if (!actingUser?.role?.admin) {
    throw new RepublishError('Access denied', 'FORBIDDEN')
  }
}

export class RepublishService {
  static async republishResource(
    resourceId: string,
    actorUserId: string,
    options: RepublishResourceOptions
  ): Promise<PublishOutcome> {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!resource || !resource.user) {
      throw new RepublishError('Resource not found', 'NOT_FOUND')
    }

    if (!resource.user.pubkey) {
      throw new RepublishError('Resource owner missing Nostr pubkey', 'MISSING_PUBKEY')
    }

    await assertActorCanManageResource(resource, actorUserId)

    const { signedEvent, privkey, relays, relaySet, ...payload } = options
    const selectedRelays = relays && relays.length > 0 ? relays : getRelays(relaySet ?? 'default')
    const normalizedAdditionalLinks = normalizeAdditionalLinks(payload.additionalLinks)

    if (signedEvent) {
      const dTag = signedEvent.tags.find(tag => tag[0] === 'd')
      if (!dTag || dTag[1] !== resourceId) {
        throw new RepublishError('Signed event must include matching d tag', 'INVALID_D_TAG')
      }

      if (signedEvent.pubkey !== resource.user.pubkey) {
        throw new RepublishError('Signed event must be signed by resource owner', 'INVALID_PUBKEY')
      }

      const parsedEvent = parseEvent(signedEvent)
      const eventPriceString = parsedEvent.price?.trim() ?? ''
      const eventPrice = eventPriceString ? Number(eventPriceString) : 0

      if (Number.isNaN(eventPrice)) {
        throw new RepublishError('Signed event price is invalid', 'INVALID_PRICE', {
          price: parsedEvent.price,
        })
      }

      const payloadPrice = typeof payload.price === 'number' ? payload.price : 0
      if (payloadPrice !== eventPrice) {
        throw new RepublishError('Payload price does not match signed event', 'PRICE_MISMATCH', {
          payloadPrice,
          eventPrice,
        })
      }

      if (payload.type !== parsedEvent.type) {
        throw new RepublishError('Payload type does not match signed event', 'TYPE_MISMATCH', {
          payloadType: payload.type,
          eventType: parsedEvent.type,
        })
      }

      const eventIsVideo = parsedEvent.type === 'video'
      const eventVideoUrl = eventIsVideo ? (parsedEvent.videoUrl?.trim() || null) : null
      const payloadVideoUrl = payload.type === 'video' ? (payload.videoUrl?.trim() || null) : null

      if (payloadVideoUrl && payloadVideoUrl !== eventVideoUrl) {
        throw new RepublishError('Payload video URL does not match signed event', 'VIDEO_URL_MISMATCH', {
          payloadVideoUrl,
          eventVideoUrl,
        })
      }

      if (!eventIsVideo && payloadVideoUrl) {
        throw new RepublishError('Signed event is not a video but payload provided video URL', 'VIDEO_TYPE_MISMATCH', {
          payloadVideoUrl,
        })
      }

      const publishedRelays = await publishToRelays(selectedRelays, signedEvent)

      await prisma.$transaction(async tx => {
        await tx.resource.update({
          where: { id: resourceId },
          data: {
            price: eventPrice,
            noteId: signedEvent.id,
            videoUrl: eventVideoUrl,
          },
        })
      })

      return {
        event: signedEvent,
        noteId: signedEvent.id,
        publishedRelays,
        mode: 'signed-event',
      }
    }

    const signingPrivkey = privkey || resource.user.privkey

    if (!signingPrivkey) {
      if (!resource.user.privkey) {
        throw new RepublishError(
          'Private key required to republish this resource',
          'PRIVKEY_REQUIRED'
        )
      }
      throw new RepublishError('Private key unavailable for server-side signing', 'PRIVKEY_REQUIRED')
    }

    const draftLike: ResourceEventDraftInput = {
      id: resourceId,
      userId: resource.userId,
      type: payload.type,
      title: payload.title,
      summary: payload.summary,
      content: payload.content,
      image: payload.image,
      price: payload.price,
      topics: payload.topics,
      additionalLinks: normalizedAdditionalLinks,
      videoUrl: payload.type === 'video' ? payload.videoUrl ?? null : undefined,
    }

    const event = createResourceEvent(draftLike, signingPrivkey)
    const noteId = extractNoteId(event)

    // Verify the event pubkey matches the resource owner's pubkey
    if (event.pubkey !== resource.user.pubkey) {
      throw new RepublishError('Event must be signed by resource owner', 'INVALID_PUBKEY')
    }

    if (!noteId || noteId !== resourceId) {
      throw new RepublishError('Generated event missing matching d tag', 'INVALID_EVENT')
    }

    const publishedRelays = await publishToRelays(selectedRelays, event)

    await prisma.$transaction(async tx => {
      await tx.resource.update({
        where: { id: resourceId },
        data: {
          price: payload.price,
          noteId: event.id,
          videoUrl: payload.type === 'video' ? payload.videoUrl ?? null : null,
        },
      })
    })

    return {
      event,
      noteId: event.id,
      publishedRelays,
      mode: 'server-sign',
    }
  }

  static async republishCourse(
    courseId: string,
    actorUserId: string,
    options: RepublishCourseOptions
  ): Promise<PublishOutcome> {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        user: {
          include: {
            role: true,
          },
        },
        lessons: {
          orderBy: { index: 'asc' },
          include: {
            resource: {
              include: {
                user: {
                  select: {
                    pubkey: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!course || !course.user) {
      throw new RepublishError('Course not found', 'NOT_FOUND')
    }

    if (!course.user.pubkey) {
      throw new RepublishError('Course owner missing Nostr pubkey', 'MISSING_PUBKEY')
    }

    await assertActorCanManageCourse(course, actorUserId)

    const { signedEvent, privkey, relays, relaySet, ...payload } = options
    const selectedRelays = relays && relays.length > 0 ? relays : getRelays(relaySet ?? 'default')

    const missingLessonIds: string[] = []
    const lessonReferences: Array<{ resourceId: string; pubkey: string }> = []

    for (const lesson of course.lessons) {
      if (!lesson.resourceId) {
        missingLessonIds.push(lesson.id)
        continue
      }

      const lessonPubkey = lesson.resource?.user?.pubkey
      if (!lessonPubkey) {
        missingLessonIds.push(lesson.id)
        continue
      }

      lessonReferences.push({
        resourceId: lesson.resourceId,
        pubkey: lessonPubkey,
      })
    }

    if (missingLessonIds.length > 0 || lessonReferences.length === 0) {
      throw new RepublishError(
        missingLessonIds.length > 0
          ? `Course contains ${missingLessonIds.length} lesson(s) missing resources or publisher pubkeys`
          : 'Course must reference at least one published lesson',
        'MISSING_LESSONS'
      )
    }

    if (signedEvent) {
      const dTag = signedEvent.tags.find(tag => tag[0] === 'd')
      if (!dTag || dTag[1] !== courseId) {
        throw new RepublishError('Signed event must include matching d tag', 'INVALID_D_TAG')
      }

      if (signedEvent.pubkey !== course.user.pubkey) {
        throw new RepublishError('Signed event must be signed by course owner', 'INVALID_PUBKEY')
      }

      const parsedCourse = parseCourseEvent(signedEvent)
      const coursePriceString = parsedCourse.price?.trim() ?? ''
      const coursePrice = coursePriceString ? Number(coursePriceString) : 0

      if (Number.isNaN(coursePrice)) {
        throw new RepublishError('Signed event price is invalid', 'INVALID_PRICE', {
          price: parsedCourse.price,
        })
      }

      const payloadPrice = typeof payload.price === 'number' ? payload.price : 0
      if (payloadPrice !== coursePrice) {
        throw new RepublishError('Payload price does not match signed event', 'PRICE_MISMATCH', {
          payloadPrice,
          eventPrice: coursePrice,
        })
      }

      // Ensure the signed event references the same lesson set as the database
      const expectedLessonRefs = new Set(
        lessonReferences.map(ref => `${ref.pubkey}:${ref.resourceId}`)
      )

      const eventLessonRefs = new Set(
        signedEvent.tags
          .filter(tag => tag[0] === 'a' && typeof tag[1] === 'string')
          .map(([, ref]) => {
            const parts = ref.split(':') // Format: "<kind>:<pubkey>:<identifier>"
            return parts.length >= 3 ? `${parts[1]}:${parts[2]}` : ''
          })
          .filter(Boolean)
      )

      const lessonsMismatch =
        eventLessonRefs.size === 0 ||
        eventLessonRefs.size !== expectedLessonRefs.size ||
        [...expectedLessonRefs].some(key => !eventLessonRefs.has(key))

      if (lessonsMismatch) {
        throw new RepublishError(
          'Signed course event lessons do not match current course lessons',
          'LESSON_MISMATCH',
          {
            expected: [...expectedLessonRefs],
            event: [...eventLessonRefs],
          }
        )
      }

      const publishedRelays = await publishToRelays(selectedRelays, signedEvent)

      await prisma.$transaction(async tx => {
        await tx.course.update({
          where: { id: courseId },
          data: {
            price: coursePrice,
            noteId: signedEvent.id,
          },
        })
      })

      return {
        event: signedEvent,
        noteId: signedEvent.id,
        publishedRelays,
        mode: 'signed-event',
      }
    }

    const signingPrivkey = privkey || course.user.privkey

    if (!signingPrivkey) {
      if (!course.user.privkey) {
        throw new RepublishError(
          'Private key required to republish this course',
          'PRIVKEY_REQUIRED'
        )
      }
      throw new RepublishError('Private key unavailable for server-side signing', 'PRIVKEY_REQUIRED')
    }

    const draftLike: CourseEventDraftInput = {
      id: courseId,
      userId: course.userId,
      title: payload.title,
      summary: payload.summary,
      image: payload.image,
      price: payload.price,
      topics: payload.topics,
    }

    const event = createCourseEvent(draftLike, lessonReferences, signingPrivkey)
    const noteId = extractNoteId(event)

    // Verify the event pubkey matches the course owner's pubkey
    if (event.pubkey !== course.user.pubkey) {
      throw new RepublishError('Event must be signed by course owner', 'INVALID_PUBKEY')
    }

    if (!noteId || noteId !== courseId) {
      throw new RepublishError('Generated event missing matching d tag', 'INVALID_EVENT')
    }

    const publishedRelays = await publishToRelays(selectedRelays, event)

    await prisma.$transaction(async tx => {
      await tx.course.update({
        where: { id: courseId },
        data: {
          price: payload.price,
          noteId: event.id,
        },
      })
    })

    return {
      event,
      noteId: event.id,
      publishedRelays,
      mode: 'server-sign',
    }
  }
}
