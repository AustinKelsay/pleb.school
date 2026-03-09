import { ZodError, z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { getCommunitySpace } from "@/lib/community/config"
import {
  createCommunityJoinRequestTemplate,
  createCommunityLeaveRequestTemplate,
} from "@/lib/community/events"
import {
  createServerCommunityRelayServiceForUser,
  getCommunityViewerContext,
} from "@/lib/community/server"
import { CommunityError } from "@/lib/community/types"
import logger from "@/lib/logger"

const MembershipMutationSchema = z.object({
  action: z.enum(["join", "leave"]),
})

export async function POST(request: NextRequest) {
  const viewer = await getCommunityViewerContext()
  let relayService: Awaited<ReturnType<typeof createServerCommunityRelayServiceForUser>>["service"] | null = null

  if (!viewer.userId) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required to update community membership.",
        code: "auth_required",
      },
      { status: 401 }
    )
  }

  try {
    const payload = MembershipMutationSchema.parse(await request.json())
    const { service } = await createServerCommunityRelayServiceForUser(viewer.userId)
    relayService = service
    const space = getCommunitySpace()

    await relayService.connect()

    const template = payload.action === "join"
      ? createCommunityJoinRequestTemplate(space.groupId, {
          isProtected: space.isProtected,
        })
      : createCommunityLeaveRequestTemplate(space.groupId, {
          isProtected: space.isProtected,
        })

    const result = await relayService.publishTemplate(template)

    return NextResponse.json({
      success: true,
      data: {
        action: payload.action,
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

    logger.error("Failed to update community membership", error)

    const status = error instanceof CommunityError && error.code === "auth_unavailable" ? 400 : 500
    const code = error instanceof CommunityError ? error.code : "relay_error"
    const message = error instanceof Error ? error.message : "Failed to update community membership"

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
