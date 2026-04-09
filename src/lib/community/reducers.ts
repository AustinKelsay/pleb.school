import {
  GroupMembershipStatus,
  GROUP_METADATA_KIND,
  parseGroupMetadataEvent,
  reduceGroupAdmins,
  reduceGroupMembers,
  reduceGroupMembershipStatus,
  type NostrEvent,
} from "snstr"
import type {
  Membership,
  ReducedGroupState,
  RoomMembership,
} from "./types"

export function pickLatestEvent(events: NostrEvent[], kind: number, groupId: string): NostrEvent | undefined {
  return events
    .filter((event) =>
      event.kind === kind &&
      event.tags.some((tag) => tag[0] === "d" && tag[1] === groupId)
    )
    .sort((left, right) => right.created_at - left.created_at)[0]
}

export function reduceCommunityGroupState(
  events: NostrEvent[],
  groupId: string,
  memberPubkey?: string
): ReducedGroupState {
  const metadataEvent = pickLatestEvent(events, GROUP_METADATA_KIND, groupId)
  const memberPubkeys = reduceGroupMembers(events, groupId)
  const admins = reduceGroupAdmins(events, groupId)
  const membershipStatus = memberPubkey
    ? reduceGroupMembershipStatus(events, memberPubkey, groupId)
    : undefined

  return {
    groupId,
    metadata: metadataEvent ? parseGroupMetadataEvent(metadataEvent) : undefined,
    admins,
    memberPubkeys,
    membershipStatus,
  }
}

export function createSpaceMembership(
  spaceId: string,
  pubkey: string,
  events: NostrEvent[],
  groupId: string
): Membership {
  const status = reduceGroupMembershipStatus(events, pubkey, groupId)

  return {
    spaceId,
    pubkey,
    status,
    isMember: status === GroupMembershipStatus.Granted,
  }
}

export function createRoomMembership(params: {
  spaceId: string
  roomId: string
  pubkey: string
  events: NostrEvent[]
  groupId: string
  inheritedFromSpace?: boolean
}): RoomMembership {
  const status = reduceGroupMembershipStatus(params.events, params.pubkey, params.groupId)

  return {
    spaceId: params.spaceId,
    roomId: params.roomId,
    pubkey: params.pubkey,
    status,
    isMember: status === GroupMembershipStatus.Granted,
    inheritedFromSpace: params.inheritedFromSpace ?? false,
  }
}
