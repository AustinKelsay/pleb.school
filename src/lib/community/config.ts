import { z } from "zod"
import communitiesConfigRaw from "../../../config/communities.json"
import { normalizeRelayUrl } from "@/lib/nostr-relays"
import type {
  CommunityAdminSetupState,
  CommunityClientSpaceConfig,
  CommunitiesConfig,
  CommunityRoomConfig,
  CommunitySetupState,
  CommunitySpaceConfig,
  Room,
  Space,
} from "./types"

const COMMUNITY_PLACEHOLDER_HOSTS = new Set([
  "community.pleb.school",
])

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  return normalizeRelayUrl(new URL(trimmed))
}

function parseRelayUrl(value: string): string {
  const normalized = normalizeUrl(value)
  const protocol = new URL(normalized).protocol
  if (protocol !== "wss:" && protocol !== "ws:") {
    throw new Error("Relay URL must use ws:// or wss://")
  }
  return normalized
}

function parseManagementUrl(value: string): string {
  const trimmed = value.trim()
  const parsed = new URL(trimmed)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Management URL must use http:// or https://")
  }
  return parsed.toString().replace(/\/$/, "")
}

const RoomInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  groupId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  default: z.boolean().default(false),
  requiresMembership: z.boolean().default(true),
  private: z.boolean().default(false),
  protected: z.boolean().default(false),
})

const SpaceInputSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean().default(false),
  relayUrl: z.string().trim().min(1).transform(parseRelayUrl),
  managementUrl: z.string().trim().min(1).transform(parseManagementUrl).optional(),
  groupId: z.string().trim().min(1),
  requiresAuth: z.boolean().default(true),
  private: z.boolean().default(false),
  protected: z.boolean().default(false),
  rooms: z.array(RoomInputSchema).min(1),
})

const CommunitiesConfigSchema = z.object({
  space: SpaceInputSchema,
  _comments: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
  const roomIds = new Set<string>()
  let defaultRoomCount = 0

  value.space.rooms.forEach((room, index) => {
    if (roomIds.has(room.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["space", "rooms", index, "id"],
        message: `Duplicate room id "${room.id}"`,
      })
    }
    roomIds.add(room.id)

    if (room.default) {
      defaultRoomCount += 1
    }
  })

  if (defaultRoomCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["space", "rooms"],
      message: "Exactly one room must be marked as default.",
    })
  }
})

function mapRoomConfig(input: z.infer<typeof RoomInputSchema>): CommunityRoomConfig {
  return {
    id: input.id,
    name: input.name,
    groupId: input.groupId,
    description: input.description,
    isDefault: input.default,
    requiresMembership: input.requiresMembership,
    isPrivate: input.private,
    isProtected: input.protected,
  }
}

function mapSpaceConfig(input: z.infer<typeof SpaceInputSchema>): CommunitySpaceConfig {
  return {
    id: input.id,
    name: input.name,
    isEnabled: input.enabled,
    relayUrl: input.relayUrl,
    managementUrl: input.managementUrl,
    groupId: input.groupId,
    requiresAuth: input.requiresAuth,
    isPrivate: input.private,
    isProtected: input.protected,
    rooms: input.rooms.map(mapRoomConfig),
  }
}

function mapSpaceConfigToClientConfig(space: CommunitySpaceConfig): CommunityClientSpaceConfig {
  return {
    id: space.id,
    name: space.name,
    isEnabled: space.isEnabled,
    relayUrl: space.relayUrl,
    groupId: space.groupId,
    requiresAuth: space.requiresAuth,
    isPrivate: space.isPrivate,
    isProtected: space.isProtected,
    rooms: space.rooms.map((room) => ({ ...room })),
  }
}

function isPlaceholderCommunityUrl(value?: string): boolean {
  if (!value) {
    return false
  }

  try {
    return COMMUNITY_PLACEHOLDER_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

export function parseCommunitiesConfig(raw: unknown): CommunitiesConfig {
  const parsed = CommunitiesConfigSchema.parse(raw)
  return {
    space: mapSpaceConfig(parsed.space),
  }
}

const communitiesConfig = parseCommunitiesConfig(communitiesConfigRaw)

export function getCommunitiesConfig(): CommunitiesConfig {
  return communitiesConfig
}

export function getCommunitySpace(): CommunitySpaceConfig {
  return communitiesConfig.space
}

export function getCommunityClientConfig(): CommunityClientSpaceConfig {
  return mapSpaceConfigToClientConfig(getCommunitySpace())
}

export function getCommunityRoom(roomId: string): CommunityRoomConfig | undefined {
  return getCommunityRoomForSpace(roomId, communitiesConfig.space)
}

export function getCommunityRoomForSpace(
  roomId: string,
  space: CommunitySpaceConfig = getCommunitySpace()
): CommunityRoomConfig | undefined {
  return space.rooms.find((room) => room.id === roomId)
}

export function getDefaultCommunityRoom(): CommunityRoomConfig {
  const room = communitiesConfig.space.rooms.find((candidate) => candidate.isDefault)
  if (!room) {
    throw new Error("No default community room configured.")
  }
  return room
}

export function resolveCommunityRoomGroupId(
  room: Pick<CommunityRoomConfig, "groupId">,
  space: CommunitySpaceConfig = getCommunitySpace()
): string {
  return room.groupId ?? space.groupId
}

export function getCommunitySetupState(
  space: CommunitySpaceConfig = getCommunitySpace()
): CommunityAdminSetupState {
  const reasons: CommunityAdminSetupState["reasons"] = []

  if (!space.isEnabled) {
    reasons.push("disabled")
  }

  if (isPlaceholderCommunityUrl(space.relayUrl)) {
    reasons.push("placeholder_relay")
  }

  if (isPlaceholderCommunityUrl(space.managementUrl)) {
    reasons.push("placeholder_management")
  }

  return {
    isConfigured: reasons.length === 0,
    reasons,
    relayUrl: space.relayUrl,
    managementUrl: space.managementUrl,
    groupId: space.groupId,
    roomCount: space.rooms.length,
    checklist: [
      "Set `space.enabled` to `true` once your community relay is ready.",
      "Point `space.relayUrl` at your Zooid relay WebSocket endpoint (`wss://...`).",
      "Set `space.managementUrl` to the matching HTTPS admin/API endpoint if you want NIP-86 management flows.",
      "Set `space.groupId` to the primary NIP-29 group id for the space and configure `space.rooms[].groupId` values where needed.",
      "Restart or redeploy the app after updating `config/communities.json`.",
    ],
  }
}

export function getCommunityClientSetupState(
  space: CommunityClientSpaceConfig = getCommunityClientConfig()
): CommunitySetupState {
  const reasons: CommunitySetupState["reasons"] = []

  if (!space.isEnabled) {
    reasons.push("disabled")
  }

  if (isPlaceholderCommunityUrl(space.relayUrl)) {
    reasons.push("placeholder_relay")
  }

  return {
    isConfigured: reasons.length === 0,
    reasons,
    relayUrl: space.relayUrl,
    groupId: space.groupId,
    roomCount: space.rooms.length,
    checklist: [
      "Set `space.enabled` to `true` once your community relay is ready.",
      "Point `space.relayUrl` at your Zooid relay WebSocket endpoint (`wss://...`).",
      "Set `space.groupId` to the primary NIP-29 group id for the space and configure `space.rooms[].groupId` values where needed.",
      "Restart or redeploy the app after updating `config/communities.json`.",
    ],
  }
}

export function mapSpaceConfigToSpace(space: CommunitySpaceConfig = getCommunitySpace()): Space {
  return {
    id: space.id,
    name: space.name,
    isEnabled: space.isEnabled,
    relayUrl: space.relayUrl,
    groupId: space.groupId,
    requiresAuth: space.requiresAuth,
    isPrivate: space.isPrivate,
    isProtected: space.isProtected,
    rooms: space.rooms.map((room) => mapRoomConfigToRoom(room, space)),
  }
}

export function mapRoomConfigToRoom(
  room: CommunityRoomConfig,
  space: CommunitySpaceConfig = getCommunitySpace()
): Room {
  return {
    id: room.id,
    spaceId: space.id,
    name: room.name,
    groupId: resolveCommunityRoomGroupId(room, space),
    description: room.description,
    isDefault: room.isDefault,
    requiresMembership: room.requiresMembership,
    isPrivate: room.isPrivate,
    isProtected: room.isProtected,
  }
}
