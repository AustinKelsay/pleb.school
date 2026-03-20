import { NextRequest, NextResponse } from "next/server"
import { getCommunityRoomForSpace, getCommunitySpace } from "@/lib/community/config"
import { loadCommunityRoomData } from "@/lib/community/queries"
import { CommunityRelayService } from "@/lib/community/relay-service"
import {
  createServerCommunityRelayServiceForUser,
  getCommunityViewerContext,
} from "@/lib/community/server"
import { CommunityError } from "@/lib/community/types"
import logger from "@/lib/logger"

function getCommunityRoomErrorStatus(error: CommunityError): number {
  switch (error.code) {
    case "auth_required":
    case "auth_failed":
    case "auth_unavailable":
      return 401
    case "membership_required":
    case "permission_denied":
    case "protected_content_required":
      return 403
    case "relay_unreachable":
    case "relay_timeout":
    case "relay_error":
      return 503
    default:
      return 400
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await context.params
  const spaceConfig = getCommunitySpace()
  const roomConfig = getCommunityRoomForSpace(roomId, spaceConfig)

  if (!roomConfig) {
    return NextResponse.json(
      {
        success: false,
        code: "room_not_found",
        error: `Unknown community room "${roomId}".`,
      },
      { status: 404 }
    )
  }

  let relayService: CommunityRelayService | null = null

  try {
    const viewer = await getCommunityViewerContext()
    if (viewer.userId && viewer.canServerSign) {
      const { service, pubkey } = await createServerCommunityRelayServiceForUser(viewer.userId)
      relayService = service
      if (pubkey) {
        viewer.pubkey = pubkey
      }
    } else {
      relayService = new CommunityRelayService({
        autoAuthenticate: false,
      })
    }

    await relayService.connect()

    const limitParam = request.nextUrl.searchParams.get("limit")
    const parsedLimit = limitParam ? Number(limitParam) : 50
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(parsedLimit)))
      : 50
    const data = await loadCommunityRoomData({
      relayService,
      viewer,
      roomId,
      limit,
      space: spaceConfig,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    logger.error("Failed to load community room state", { roomId, error })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load community room state",
        code: error instanceof CommunityError ? error.code : "relay_error",
      },
      { status: error instanceof CommunityError ? getCommunityRoomErrorStatus(error) : 500 }
    )
  } finally {
    relayService?.disconnect()
  }
}
