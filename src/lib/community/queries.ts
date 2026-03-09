import {
  GROUP_MEMBERS_KIND,
  GroupMembershipStatus,
  JOIN_REQUEST_KIND,
  LEAVE_REQUEST_KIND,
  PUT_USER_KIND,
  REMOVE_USER_KIND,
} from "snstr"
import {
  getCommunityRoom,
  getCommunitySpace,
  mapRoomConfigToRoom,
  mapSpaceConfigToSpace,
  resolveCommunityRoomGroupId,
} from "./config"
import { COMMUNITY_MESSAGE_KIND, parseCommunityMessage, sortEventsNewestFirst } from "./events"
import { createRoomMembership, createSpaceMembership, reduceCommunityGroupState } from "./reducers"
import type {
  CommunityRoomData,
  CommunitySpaceConfig,
  CommunitySpaceData,
  CommunityViewerContext,
} from "./types"
import type { CommunityRelayService } from "./relay-service"

function hasRoomSpecificMembershipSignals(events: Array<{ kind: number }>): boolean {
  return events.some((event) =>
    [
      GROUP_MEMBERS_KIND,
      JOIN_REQUEST_KIND,
      LEAVE_REQUEST_KIND,
      PUT_USER_KIND,
      REMOVE_USER_KIND,
    ].includes(event.kind)
  )
}

function buildStateSummary(memberCount: number, adminCount: number, metadata?: CommunitySpaceData["state"]["metadata"]) {
  return {
    metadata,
    memberCount,
    adminCount,
  }
}

export async function loadCommunitySpaceData(params: {
  relayService: CommunityRelayService
  viewer: CommunityViewerContext
  space?: CommunitySpaceConfig
}): Promise<CommunitySpaceData> {
  const space = params.space ?? getCommunitySpace()
  const spaceEvents = await params.relayService.fetchGroupStateEvents(space.groupId, params.viewer.pubkey)
  const reducedSpaceState = reduceCommunityGroupState(spaceEvents, space.groupId, params.viewer.pubkey)
  const spaceMembership = params.viewer.pubkey
    ? createSpaceMembership(space.id, params.viewer.pubkey, spaceEvents, space.groupId)
    : null

  const rooms = await Promise.all(
    space.rooms.map(async (roomConfig) => {
      const groupId = resolveCommunityRoomGroupId(roomConfig, space)
      const roomEvents = groupId === space.groupId
        ? spaceEvents
        : await params.relayService.fetchGroupStateEvents(groupId, params.viewer.pubkey)
      const roomState = reduceCommunityGroupState(roomEvents, groupId, params.viewer.pubkey)
      const roomMembership = params.viewer.pubkey
        ? createRoomMembership({
            spaceId: space.id,
            roomId: roomConfig.id,
            pubkey: params.viewer.pubkey,
            events: roomEvents,
            groupId,
            inheritedFromSpace: groupId === space.groupId,
          })
        : null

      return {
        ...mapRoomConfigToRoom(roomConfig, space),
        state: buildStateSummary(
          roomState.memberPubkeys.length,
          roomState.admins.length,
          roomState.metadata
        ),
        membership: roomMembership
          ? {
              status: roomMembership.status,
              isMember: roomMembership.isMember,
              inheritedFromSpace: roomMembership.inheritedFromSpace,
            }
          : null,
      }
    })
  )

  return {
    space: mapSpaceConfigToSpace(space),
    viewer: params.viewer,
    membership: spaceMembership,
    state: buildStateSummary(
      reducedSpaceState.memberPubkeys.length,
      reducedSpaceState.admins.length,
      reducedSpaceState.metadata
    ),
    rooms,
  }
}

export async function loadCommunityRoomData(params: {
  relayService: CommunityRelayService
  viewer: CommunityViewerContext
  roomId: string
  limit?: number
  space?: CommunitySpaceConfig
}): Promise<CommunityRoomData> {
  const space = params.space ?? getCommunitySpace()
  const roomConfig = getCommunityRoom(params.roomId)

  if (!roomConfig) {
    throw new Error(`Unknown community room "${params.roomId}".`)
  }

  const room = mapRoomConfigToRoom(roomConfig, space)
  const roomStateEvents = await params.relayService.fetchGroupStateEvents(room.groupId, params.viewer.pubkey)
  const roomState = reduceCommunityGroupState(roomStateEvents, room.groupId, params.viewer.pubkey)
  const roomMessages = await params.relayService.fetchRoomMessages(room.id, [COMMUNITY_MESSAGE_KIND])

  let spaceMembership = null
  if (params.viewer.pubkey) {
    if (room.groupId === space.groupId) {
      spaceMembership = createSpaceMembership(space.id, params.viewer.pubkey, roomStateEvents, space.groupId)
    } else {
      const spaceStateEvents = await params.relayService.fetchGroupStateEvents(space.groupId, params.viewer.pubkey)
      spaceMembership = createSpaceMembership(space.id, params.viewer.pubkey, spaceStateEvents, space.groupId)
    }
  }

  let roomMembership = null
  const hasRoomSpecificMembership = hasRoomSpecificMembershipSignals(roomStateEvents)

  if (params.viewer.pubkey) {
    if (room.requiresMembership && hasRoomSpecificMembership && room.groupId !== space.groupId) {
      const reducedRoomMembership = createRoomMembership({
        spaceId: space.id,
        roomId: room.id,
        pubkey: params.viewer.pubkey,
        events: roomStateEvents,
        groupId: room.groupId,
        inheritedFromSpace: false,
      })
      roomMembership = {
        status: reducedRoomMembership.status,
        isMember: reducedRoomMembership.isMember,
        inheritedFromSpace: reducedRoomMembership.inheritedFromSpace,
      }
    } else {
      roomMembership = {
        status: spaceMembership?.status ?? GroupMembershipStatus.Initial,
        isMember: room.requiresMembership ? (spaceMembership?.isMember ?? false) : true,
        inheritedFromSpace: true,
      }
    }
  }

  return {
    room,
    viewer: params.viewer,
    membership: roomMembership,
    spaceMembership: spaceMembership
      ? {
          status: spaceMembership.status,
          isMember: spaceMembership.isMember,
        }
      : null,
    state: buildStateSummary(
      roomState.memberPubkeys.length,
      roomState.admins.length,
      roomState.metadata
    ),
    messages: sortEventsNewestFirst(roomMessages)
      .slice(0, params.limit ?? 50)
      .map(parseCommunityMessage),
  }
}
