"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getCommunityRoom,
  getCommunitySetupState,
  getCommunitySpace,
  resolveCommunityRoomGroupId,
} from "@/lib/community/config"
import {
  buildCommunityRoomMessageTemplate,
  createCommunityJoinRequestTemplate,
  createCommunityLeaveRequestTemplate,
} from "@/lib/community/events"
import { loadCommunityRoomData, loadCommunitySpaceData } from "@/lib/community/queries"
import { CommunityRelayService } from "@/lib/community/relay-service"
import { resolveCommunitySigner } from "@/lib/community/signer"
import type {
  CommunityRoomData,
  CommunitySpaceData,
  CommunityViewerContext,
} from "@/lib/community/types"
import { useSession } from "@/hooks/useSession"

type ApiEnvelope<T> = {
  success: boolean
  data: T
  error?: string
  code?: string
}

type CommunitySpaceResponse = ApiEnvelope<CommunitySpaceData>
type CommunityRoomResponse = ApiEnvelope<CommunityRoomData>

export const communityQueryKeys = {
  all: ["community"] as const,
  space: () => [...communityQueryKeys.all, "space"] as const,
  room: (roomId: string) => [...communityQueryKeys.all, "room", roomId] as const,
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string; code?: string; data?: T } | null
  if (!response.ok) {
    const error = new Error(body?.error || "Community request failed.") as Error & {
      code?: string
      status?: number
    }
    error.code = body?.code
    error.status = response.status
    throw error
  }

  if (!body) {
    const error = new Error("Empty response body from community API.") as Error & {
      code?: string
      status?: number
    }
    error.status = response.status
    throw error
  }

  if (body.data === undefined) {
    const error = new Error("Missing data field in community API response.") as Error & {
      code?: string
      status?: number
    }
    error.code = body.code
    error.status = response.status
    throw error
  }

  return body.data
}

export async function fetchCommunitySpace() {
  const response = await fetch("/api/community", {
    cache: "no-store",
  })

  return parseApiResponse<CommunitySpaceResponse["data"]>(response)
}

export async function fetchCommunityRoom(roomId: string) {
  const response = await fetch(`/api/community/rooms/${encodeURIComponent(roomId)}?limit=50`, {
    cache: "no-store",
  })

  return parseApiResponse<CommunityRoomResponse["data"]>(response)
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  return parseApiResponse<T>(response)
}

function buildViewerContextFromSession(session: ReturnType<typeof useSession>["data"]): CommunityViewerContext {
  return {
    userId: session?.user?.id,
    pubkey: session?.user?.pubkey,
    provider: session?.provider,
    isAuthenticated: Boolean(session?.user?.id),
    canServerSign: Boolean(session?.user?.hasEphemeralKeys),
  }
}

function shouldUseDirectRelayReads(session: ReturnType<typeof useSession>["data"]) {
  const space = getCommunitySpace()
  const setupState = getCommunitySetupState(space)
  return Boolean(
    setupState.isConfigured &&
    space.requiresAuth &&
    session?.provider === "nostr" &&
    !session?.user?.hasEphemeralKeys
  )
}

async function fetchCommunitySpaceDirect(
  session: ReturnType<typeof useSession>["data"]
): Promise<CommunitySpaceData> {
  const signer = await resolveCommunitySigner({
    allowNip07: true,
  })
  const relayService = new CommunityRelayService({
    signer: signer.signer,
  })

  try {
    await relayService.connect()
    return await loadCommunitySpaceData({
      relayService,
      viewer: buildViewerContextFromSession(session),
    })
  } finally {
    relayService.disconnect()
  }
}

async function fetchCommunityRoomDirect(
  roomId: string,
  session: ReturnType<typeof useSession>["data"]
): Promise<CommunityRoomData> {
  const signer = await resolveCommunitySigner({
    allowNip07: true,
  })
  const relayService = new CommunityRelayService({
    signer: signer.signer,
  })

  try {
    await relayService.connect()
    return await loadCommunityRoomData({
      relayService,
      viewer: buildViewerContextFromSession(session),
      roomId,
      limit: 50,
    })
  } finally {
    relayService.disconnect()
  }
}

async function publishDirectJoinLeave(action: "join" | "leave") {
  const signer = await resolveCommunitySigner({
    allowNip07: true,
  })
  const space = getCommunitySpace()
  const relayService = new CommunityRelayService({
    signer: signer.signer,
  })

  try {
    await relayService.connect()
    const template = action === "join"
      ? createCommunityJoinRequestTemplate(space.groupId, {
          isProtected: space.isProtected,
        })
      : createCommunityLeaveRequestTemplate(space.groupId, {
          isProtected: space.isProtected,
        })

    return await relayService.publishTemplate(template)
  } finally {
    relayService.disconnect()
  }
}

async function publishDirectMessage(roomId: string, content: string) {
  const signer = await resolveCommunitySigner({
    allowNip07: true,
  })
  const space = getCommunitySpace()
  const room = getCommunityRoom(roomId)

  if (!room) {
    throw new Error(`Unknown community room "${roomId}".`)
  }

  const relayService = new CommunityRelayService({
    signer: signer.signer,
  })

  try {
    await relayService.connect()
    const template = buildCommunityRoomMessageTemplate(
      room,
      space,
      resolveCommunityRoomGroupId(room, space),
      content
    )

    return await relayService.publishTemplate(template)
  } finally {
    relayService.disconnect()
  }
}

export function useCommunitySpaceQuery() {
  const { data: session, status } = useSession()
  const setupState = getCommunitySetupState()
  const useDirectReads = shouldUseDirectRelayReads(session)

  return useQuery({
    queryKey: [
      ...communityQueryKeys.space(),
      session?.user?.id ?? "anon",
      useDirectReads ? "direct" : "api",
    ],
    queryFn: () => useDirectReads ? fetchCommunitySpaceDirect(session) : fetchCommunitySpace(),
    enabled: status !== "loading" && setupState.isConfigured,
    refetchInterval: 30_000,
  })
}

export function useCommunityRoomQuery(roomId?: string) {
  const { data: session, status } = useSession()
  const setupState = getCommunitySetupState()
  const useDirectReads = shouldUseDirectRelayReads(session)

  return useQuery({
    queryKey: [
      ...communityQueryKeys.room(roomId || "unknown"),
      session?.user?.id ?? "anon",
      useDirectReads ? "direct" : "api",
    ],
    queryFn: () => useDirectReads ? fetchCommunityRoomDirect(roomId!, session) : fetchCommunityRoom(roomId!),
    enabled: Boolean(roomId) && status !== "loading" && setupState.isConfigured,
    refetchInterval: 15_000,
  })
}

export function useCommunityMembershipMutation() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation({
    mutationFn: async (action: "join" | "leave") => {
      if (session?.user?.hasEphemeralKeys) {
        return postJson("/api/community/membership", { action })
      }

      if (session?.provider === "nostr") {
        return publishDirectJoinLeave(action)
      }

      throw new Error("No supported signing path is available for this account.")
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityQueryKeys.space() })
      await queryClient.invalidateQueries({ queryKey: communityQueryKeys.all })
    },
  })
}

export function useCommunityMessageMutation() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation({
    mutationFn: async (payload: { roomId: string; content: string }) => {
      if (session?.user?.hasEphemeralKeys) {
        return postJson("/api/community/messages", payload)
      }

      if (session?.provider === "nostr") {
        return publishDirectMessage(payload.roomId, payload.content)
      }

      throw new Error("No supported signing path is available for this account.")
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: communityQueryKeys.space() })
      await queryClient.invalidateQueries({ queryKey: communityQueryKeys.room(variables.roomId) })
    },
  })
}
