import {
  createEvent,
  getEventHash,
  getPublicKey,
  signEvent,
  verifySignature,
  withProtectedTag,
  type EventTemplate,
  type NostrEvent,
} from "snstr"
import { parseCommunityEventTags } from "@/data/types"
import type {
  CommunityRoomConfig,
  CommunityRoomMessage,
  CommunitySpaceConfig,
} from "./types"

export const COMMUNITY_MESSAGE_KIND = 1

interface GroupScopedTemplateOptions {
  content?: string
  tags?: string[][]
  created_at?: number
  isProtected?: boolean
}

export function createGroupScopedTemplate(
  kind: number,
  groupId: string,
  options: GroupScopedTemplateOptions = {}
): EventTemplate {
  const baseTags = [["h", groupId], ...(options.tags ?? [])]
  const tags = options.isProtected ? withProtectedTag(baseTags) : baseTags

  return {
    kind,
    content: options.content ?? "",
    created_at: options.created_at,
    tags,
  }
}

export function createCommunityJoinRequestTemplate(
  groupId: string,
  options: GroupScopedTemplateOptions = {}
): EventTemplate {
  return createGroupScopedTemplate(9021, groupId, options)
}

export function createCommunityLeaveRequestTemplate(
  groupId: string,
  options: GroupScopedTemplateOptions = {}
): EventTemplate {
  return createGroupScopedTemplate(9022, groupId, options)
}

export function createCommunityMessageTemplate(params: {
  groupId: string
  roomId?: string
  content: string
  created_at?: number
  isProtected?: boolean
}): EventTemplate {
  const tags = [
    ["client", "pleb.school"],
    ["alt", "Community room message"],
    ...(params.roomId ? [["room", params.roomId]] : []),
  ]

  return createGroupScopedTemplate(COMMUNITY_MESSAGE_KIND, params.groupId, {
    content: params.content,
    created_at: params.created_at,
    tags,
    isProtected: params.isProtected,
  })
}

export function parseCommunityMessage(event: NostrEvent): CommunityRoomMessage {
  const parsedTags = parseCommunityEventTags(event)

  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    roomId: parsedTags.roomId,
    groupId: parsedTags.groupId,
    isProtected: parsedTags.isProtected,
  }
}

export function isCommunityScopedEvent(event: NostrEvent, groupId: string): boolean {
  return event.tags.some((tag) => tag[0] === "h" && tag[1] === groupId)
}

export async function verifyCommunityEventSignature(event: NostrEvent): Promise<boolean> {
  const computedId = await getEventHash({
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
  })

  if (computedId !== event.id) {
    return false
  }

  return verifySignature(event.id, event.sig, event.pubkey)
}

export function sortEventsNewestFirst(events: NostrEvent[]): NostrEvent[] {
  return [...events].sort((left, right) => {
    if (left.created_at !== right.created_at) {
      return right.created_at - left.created_at
    }

    return right.id.localeCompare(left.id)
  })
}

export function buildCommunityRoomMessageTemplate(
  room: Pick<CommunityRoomConfig, "id" | "isProtected">,
  space: Pick<CommunitySpaceConfig, "isProtected">,
  groupId: string,
  content: string
): EventTemplate {
  return createCommunityMessageTemplate({
    groupId,
    roomId: room.id,
    content,
    isProtected: room.isProtected || space.isProtected,
  })
}

export async function createSignedCommunityEvent(
  template: EventTemplate,
  privateKey: string
): Promise<NostrEvent> {
  const unsignedEvent = createEvent(template, getPublicKey(privateKey))
  const id = await getEventHash(unsignedEvent)
  const sig = await signEvent(id, privateKey)

  return {
    ...unsignedEvent,
    id,
    sig,
  }
}
