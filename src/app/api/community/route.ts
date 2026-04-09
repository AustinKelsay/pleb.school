import { NextResponse } from "next/server"
import { getCommunitySpace } from "@/lib/community/config"
import { loadCommunitySpaceData } from "@/lib/community/queries"
import { CommunityRelayService } from "@/lib/community/relay-service"
import {
  createServerCommunityRelayServiceForUser,
  getCommunityViewerContext,
} from "@/lib/community/server"
import { CommunityError } from "@/lib/community/types"
import logger from "@/lib/logger"

function getCommunityErrorStatus(error: CommunityError): number {
  switch (error.code) {
    case "auth_failed":
    case "auth_unavailable":
    case "membership_required":
    case "permission_denied":
    case "protected_content_required":
      return 403
    case "relay_unreachable":
    case "relay_timeout":
    case "relay_error":
      return 503
    default:
      return 503
  }
}

export async function GET() {
  let relayService: CommunityRelayService | null = null

  try {
    const spaceConfig = getCommunitySpace()
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
    const data = await loadCommunitySpaceData({
      relayService,
      viewer,
      space: spaceConfig,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    logger.error("Failed to load community space state", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load community space state",
        code: error instanceof CommunityError ? error.code : "relay_error",
      },
      { status: error instanceof CommunityError ? getCommunityErrorStatus(error) : 500 }
    )
  } finally {
    relayService?.disconnect()
  }
}
