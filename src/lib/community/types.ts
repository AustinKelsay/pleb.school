import type {
  GroupAdmin,
  GroupMembershipStatus,
  ParsedGroupMetadataEvent,
  Signer,
  SignerCapabilities,
} from "snstr"

export const COMMUNITY_ERROR_CODES = [
  "auth_required",
  "auth_unavailable",
  "auth_failed",
  "membership_required",
  "permission_denied",
  "protected_content_required",
  "relay_unreachable",
  "relay_timeout",
  "relay_error",
] as const

export type CommunityErrorCode = typeof COMMUNITY_ERROR_CODES[number]
export type CommunitySignerMode = "local" | "nip07" | "custom"
export type CommunityOperation =
  | "connect"
  | "authenticate"
  | "fetch"
  | "publish"
  | "subscribe"
  | "resolve_signer"

export interface CommunityRoomConfig {
  id: string
  name: string
  groupId?: string
  description?: string
  isDefault: boolean
  requiresMembership: boolean
  isPrivate: boolean
  isProtected: boolean
}

export interface CommunitySpaceConfig {
  id: string
  name: string
  isEnabled: boolean
  relayUrl: string
  managementUrl?: string
  groupId: string
  requiresAuth: boolean
  isPrivate: boolean
  isProtected: boolean
  rooms: CommunityRoomConfig[]
}

export type CommunityClientSpaceConfig = Omit<CommunitySpaceConfig, "managementUrl">

export interface CommunitiesConfig {
  space: CommunitySpaceConfig
}

export interface Space {
  id: string
  name: string
  isEnabled: boolean
  relayUrl: string
  groupId: string
  requiresAuth: boolean
  isPrivate: boolean
  isProtected: boolean
  rooms: Room[]
}

export interface Room {
  id: string
  spaceId: string
  name: string
  groupId: string
  description?: string
  isDefault: boolean
  requiresMembership: boolean
  isPrivate: boolean
  isProtected: boolean
}

export interface Membership {
  spaceId: string
  pubkey: string
  status: GroupMembershipStatus
  isMember: boolean
}

export interface RoomMembership {
  spaceId: string
  roomId: string
  pubkey: string
  status: GroupMembershipStatus
  isMember: boolean
  inheritedFromSpace: boolean
}

export interface ModerationState {
  isMuted: boolean
  isBanned: boolean
  reportCount: number
  lastReportAt?: number
}

export interface CommunityErrorContext {
  operation: CommunityOperation
  spaceId?: string
  roomId?: string
  relayUrl?: string
  pubkey?: string
  details?: unknown
}

export class CommunityError extends Error {
  code: CommunityErrorCode
  context: CommunityErrorContext
  cause?: unknown

  constructor(
    code: CommunityErrorCode,
    message: string,
    context: CommunityErrorContext,
    cause?: unknown
  ) {
    super(message)
    this.name = "CommunityError"
    this.code = code
    this.context = context
    this.cause = cause
  }
}

export interface CommunitySignerResolution {
  mode: CommunitySignerMode
  signer: Signer
  capabilities: SignerCapabilities
  pubkey: string
}

export interface CommunityViewerContext {
  userId?: string
  pubkey?: string
  provider?: string
  isAuthenticated: boolean
  canServerSign: boolean
}

export interface ReducedGroupState {
  groupId: string
  metadata?: ParsedGroupMetadataEvent
  admins: GroupAdmin[]
  memberPubkeys: string[]
  membershipStatus?: GroupMembershipStatus
}

export interface CommunitySpaceStateSummary {
  metadata?: ParsedGroupMetadataEvent
  memberCount: number
  adminCount: number
}

export interface CommunityRoomSummary extends Room {
  state: CommunitySpaceStateSummary
  membership: Pick<RoomMembership, "status" | "isMember" | "inheritedFromSpace"> | null
}

export interface CommunityRoomMessage {
  id: string
  pubkey: string
  content: string
  createdAt: number
  roomId?: string
  groupId: string
  isProtected: boolean
}

export interface CommunitySpaceData {
  space: Space
  viewer: CommunityViewerContext
  membership: Membership | null
  state: CommunitySpaceStateSummary
  rooms: CommunityRoomSummary[]
}

export interface CommunityRoomData {
  room: Room
  viewer: CommunityViewerContext
  membership: Pick<RoomMembership, "status" | "isMember" | "inheritedFromSpace"> | null
  spaceMembership: Pick<Membership, "status" | "isMember"> | null
  state: CommunitySpaceStateSummary
  messages: CommunityRoomMessage[]
}

export type CommunitySetupReason =
  | "disabled"
  | "placeholder_relay"
  | "placeholder_management"

export interface CommunitySetupState {
  isConfigured: boolean
  reasons: CommunitySetupReason[]
  relayUrl: string
  groupId: string
  roomCount: number
  checklist: string[]
}

export interface CommunityAdminSetupState extends CommunitySetupState {
  managementUrl?: string
}
