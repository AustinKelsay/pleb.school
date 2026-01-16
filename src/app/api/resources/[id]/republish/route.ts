import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RepublishService, RepublishError } from '@/lib/republish-service'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid resource ID' }),
})

const republishSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    summary: z.string().trim().min(1, 'Summary is required'),
    content: z.string().default(''),
    price: z.number().int().min(0).default(0),
    image: z.string().url().optional().or(z.literal('')).transform(value => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : undefined
    }),
    topics: z
      .array(z.string().trim().min(1))
      .max(25)
      .optional()
      .default([]),
    additionalLinks: z
      .array(
        z.union([
          z.string().trim().url('Links must be valid URLs'),
          z.object({
            url: z.string().trim().url('Links must be valid URLs'),
            title: z.string().trim().min(1).max(120).optional(),
          }),
        ])
      )
      .max(25)
      .optional()
      .default([]),
    type: z.enum(['document', 'video']),
    videoUrl: z
      .string()
      .trim()
      .url('Video URL must be a valid URL')
      .optional(),
    privkey: z.string().optional(),
    relays: z.array(z.string().trim().min(1)).optional(),
    relaySet: z.enum(['default', 'content', 'profile', 'zapThreads']).optional(),
    signedEvent: z
      .object({
        id: z.string(),
        pubkey: z.string(),
        created_at: z.number(),
        kind: z.number(),
        tags: z.array(z.array(z.string())),
        content: z.string(),
        sig: z.string(),
      })
      .optional(),
  })
  .refine(data => !(data.privkey && data.signedEvent), {
    message: 'Provide either privkey or signedEvent, not both',
    path: ['signedEvent'],
  })
  .refine(
    data => data.type !== 'video' || (data.videoUrl && data.videoUrl.trim().length > 0),
    {
      message: 'Video URL is required and must be a valid URL when type is video',
      path: ['videoUrl'],
    }
  )

type RouteParams = {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const [body, resolvedParams] = await Promise.all([request.json(), params])

    const paramsResult = paramsSchema.safeParse(resolvedParams)
    if (!paramsResult.success) {
      return NextResponse.json({ error: 'Invalid resource ID' }, { status: 400 })
    }

    const payloadResult = republishSchema.safeParse(body)
    if (!payloadResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: payloadResult.error.flatten(),
        },
        { status: 400 }
      )
    }

    const {
      signedEvent,
      privkey,
      relays,
      relaySet,
      topics,
      additionalLinks,
      type,
      videoUrl,
      title,
      summary,
      content,
      price,
      image,
    } = payloadResult.data

    const resourceId = paramsResult.data.id

    const trimmedTitle = title.trim()
    const trimmedSummary = summary.trim()
    const sanitizedTopics = Array.from(
      new Set((topics || []).map(topic => topic.trim()).filter(Boolean))
    ).filter(topic => topic.toLowerCase() !== type)
    const normalizedLinks = normalizeAdditionalLinks(additionalLinks)

    const result = await RepublishService.republishResource(resourceId, session.user.id, {
      title: trimmedTitle,
      summary: trimmedSummary,
      content,
      price,
      image,
      topics: sanitizedTopics,
      additionalLinks: normalizedLinks,
      type,
      videoUrl: type === 'video' ? videoUrl! : undefined,
      signedEvent,
      privkey,
      relays,
      relaySet,
    })

    return NextResponse.json({
      success: true,
      data: {
        noteId: result.noteId,
        relays: result.publishedRelays,
        mode: result.mode,
      },
    })
  } catch (error) {
    if (error instanceof RepublishError) {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        ACTOR_NOT_FOUND: 403,
        PRIVKEY_REQUIRED: 400,
        INVALID_EVENT: 500,
        INVALID_D_TAG: 400,
        INVALID_PUBKEY: 400,
        MISSING_LESSONS: 400,
        RELAY_PUBLISH_FAILED: 502,
        NO_RELAYS: 400,
        MISSING_PUBKEY: 400,
      }

      const status = statusMap[error.code] ?? 400
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status }
      )
    }

    console.error('[RepublishResource] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to republish resource' }, { status: 500 })
  }
}
