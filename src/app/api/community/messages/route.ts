import { ZodError, z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import {
  getCommunityRoom,
  getCommunitySpace,
  resolveCommunityRoomGroupId,
} from "@/lib/community/config"
import { buildCommunityRoomMessageTemplate } from "@/lib/community/events"
import {
  createServerCommunityRelayServiceForUser,
  getCommunityViewerContext,
} from "@/lib/community/server"
import { CommunityError } from "@/lib/community/types"
import logger from "@/lib/logger"

const CreateMessageSchema = z.object({
  roomId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(5000),
})

export async function POST(request: NextRequest) {
  const viewer = await getCommunityViewerContext()
  let relayService: Awaited<ReturnType<typeof createServerCommunityRelayServiceForUser>>["service"] | null = null

  if (!viewer.userId) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required to send community messages.",
        code: "auth_required",
      },
      { status: 401 }
    )
  }

  try {
    const payload = CreateMessageSchema.parse(await request.json())
    const room = getCommunityRoom(payload.roomId)
    const space = getCommunitySpace()

    if (!room) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown community room "${payload.roomId}".`,
          code: "relay_error",
        },
        { status: 404 }
      )
    }

    const { service } = await createServerCommunityRelayServiceForUser(viewer.userId)
    relayService = service
    await relayService.connect()

    const template = buildCommunityRoomMessageTemplate(
      room,
      space,
      resolveCommunityRoomGroupId(room, space),
      payload.content
    )

    const result = await relayService.publishTemplate(template)

    return NextResponse.json({
      success: true,
      data: {
        roomId: payload.roomId,
        result,
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload.",
          code: "validation_error",
          details: error.issues,
        },
        { status: 400 }
      )
    }

    logger.error("Failed to publish community message", error)

    const status = error instanceof CommunityError && error.code === "auth_unavailable" ? 400 : 500
    const code = error instanceof CommunityError ? error.code : "relay_error"
    const message = error instanceof Error ? error.message : "Failed to publish community message"

    return NextResponse.json(
      {
        success: false,
        error: message,
        code,
      },
      { status }
    )
  } finally {
    relayService?.disconnect()
  }
}
