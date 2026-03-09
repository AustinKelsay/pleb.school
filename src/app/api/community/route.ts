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

export async function GET() {
  let relayService: CommunityRelayService | null = null

  try {
    const spaceConfig = getCommunitySpace()
    const viewer = await getCommunityViewerContext()
    relayService = viewer.userId && viewer.canServerSign
      ? (await createServerCommunityRelayServiceForUser(viewer.userId)).service
      : new CommunityRelayService({
          autoAuthenticate: false,
        })

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
      { status: error instanceof CommunityError ? 503 : 500 }
    )
  } finally {
    relayService?.disconnect()
  }
}
