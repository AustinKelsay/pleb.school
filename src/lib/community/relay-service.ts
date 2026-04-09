import {
  Nostr,
  RelayEvent,
  buildGroupContentFilters,
  buildGroupMembershipFilters,
  buildGroupMetadataFilters,
  createAuthEventTemplate,
  type EventTemplate,
  type Filter,
  type NostrEvent,
  type PublishResponse,
  type Signer,
} from "snstr"
import logger from "@/lib/logger"
import {
  getCommunityRoomForSpace,
  getCommunitySpace,
  resolveCommunityRoomGroupId,
} from "./config"
import type { CommunityRoomConfig, CommunitySpaceConfig } from "./types"
import { reduceCommunityGroupState } from "./reducers"
import { CommunityError } from "./types"

const DEFAULT_TIMEOUT_MS = 5000

interface CommunityRelayLogger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export interface CommunityRelayServiceOptions {
  space?: CommunitySpaceConfig
  signer?: Signer
  timeoutMs?: number
  autoAuthenticate?: boolean
  logger?: CommunityRelayLogger
}

export interface FetchCommunityEventsOptions {
  maxWait?: number
  signal?: AbortSignal
}

export class CommunityRelayService {
  private readonly space: CommunitySpaceConfig
  private readonly signer?: Signer
  private readonly timeoutMs: number
  private readonly autoAuthenticate: boolean
  private readonly logger: CommunityRelayLogger
  private readonly client: Nostr
  private pendingAuthPromise: Promise<unknown> | null = null

  constructor(options: CommunityRelayServiceOptions = {}) {
    this.space = options.space ?? getCommunitySpace()
    this.signer = options.signer
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.autoAuthenticate = options.autoAuthenticate ?? true
    this.logger = options.logger ?? logger
    this.client = new Nostr([this.space.relayUrl])
    this.bindRelayEvents()
  }

  getSpace(): CommunitySpaceConfig {
    return this.space
  }

  getClient(): Nostr {
    return this.client
  }

  async connect(): Promise<void> {
    try {
      await this.client.connectToRelays()
      if (this.pendingAuthPromise) {
        await this.pendingAuthPromise
      }
    } catch (error) {
      throw this.wrapRelayError("connect", error)
    } finally {
      this.pendingAuthPromise = null
    }
  }

  disconnect(): void {
    this.client.disconnectFromRelays()
  }

  subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent, relay: string) => void,
    onEOSE?: () => void
  ): { close: () => void } {
    try {
      const subscriptionIds = this.client.subscribe(filters, onEvent, onEOSE)
      return {
        close: () => this.client.unsubscribe(subscriptionIds),
      }
    } catch (error) {
      throw this.wrapRelayError("subscribe", error)
    }
  }

  async fetchEvents(
    filters: Filter[],
    options: FetchCommunityEventsOptions = {}
  ): Promise<NostrEvent[]> {
    try {
      return await this.client.fetchMany(filters, {
        maxWait: options.maxWait ?? this.timeoutMs,
        signal: options.signal,
      })
    } catch (error) {
      throw this.wrapRelayError("fetch", error)
    }
  }

  async fetchOne(
    filters: Filter[],
    options: FetchCommunityEventsOptions = {}
  ): Promise<NostrEvent | null> {
    try {
      return await this.client.fetchOne(filters, {
        maxWait: options.maxWait ?? this.timeoutMs,
        signal: options.signal,
      })
    } catch (error) {
      throw this.wrapRelayError("fetch", error)
    }
  }

  async publish(event: NostrEvent): Promise<{
    success: boolean
    event: NostrEvent
    relayResults: Map<string, { success: boolean; reason?: string }>
    successCount: number
    failureCount: number
  }> {
    try {
      return await this.client.publishWithDetails(event, {
        timeout: this.timeoutMs,
      })
    } catch (error) {
      throw this.wrapRelayError("publish", error)
    }
  }

  async publishTemplate(template: EventTemplate) {
    if (!this.signer) {
      throw new CommunityError(
        "auth_unavailable",
        "No signer is configured for this community relay action.",
        {
          operation: "publish",
          spaceId: this.space.id,
          relayUrl: this.space.relayUrl,
        }
      )
    }

    const signedEvent = await this.signer.signEvent(template)
    return this.publish(signedEvent)
  }

  async buildSignedAuthEvent(
    challenge: string,
    relayUrl: string = this.space.relayUrl
  ): Promise<NostrEvent> {
    if (!this.signer) {
      throw new CommunityError(
        "auth_unavailable",
        "Relay authentication is required, but no signer is configured.",
        {
          operation: "authenticate",
          relayUrl,
          spaceId: this.space.id,
        }
      )
    }

    return this.signer.signEvent(createAuthEventTemplate(challenge, relayUrl))
  }

  async authenticate(relayUrl: string, challenge: string): Promise<PublishResponse> {
    try {
      const authEvent = await this.buildSignedAuthEvent(challenge, relayUrl)
      return await this.client.authenticateRelay(relayUrl, authEvent, {
        timeout: this.timeoutMs,
      })
    } catch (error) {
      if (error instanceof CommunityError) {
        throw error
      }
      throw this.wrapRelayError("authenticate", error, {
        relayUrl,
      })
    }
  }

  async fetchSpaceState(memberPubkey?: string) {
    const events = await this.fetchGroupStateEvents(this.space.groupId, memberPubkey)
    return reduceCommunityGroupState(events, this.space.groupId, memberPubkey)
  }

  async fetchRoomState(roomId: string, memberPubkey?: string) {
    const room = this.requireRoom(roomId)
    const groupId = resolveCommunityRoomGroupId(room, this.space)
    const events = await this.fetchGroupStateEvents(groupId, memberPubkey)
    return reduceCommunityGroupState(events, groupId, memberPubkey)
  }

  async fetchRoomMessages(roomId: string, kinds: number[]): Promise<NostrEvent[]> {
    const room = this.requireRoom(roomId)
    const groupId = resolveCommunityRoomGroupId(room, this.space)
    const filters = buildGroupContentFilters(groupId, kinds).map((filter) => ({
      ...filter,
      "#room": [room.id],
    }))

    return this.fetchEvents(filters)
  }

  async fetchGroupStateEvents(groupId: string, memberPubkey?: string): Promise<NostrEvent[]> {
    const filters = [
      ...buildGroupMetadataFilters(groupId),
      ...buildGroupMembershipFilters(groupId, memberPubkey),
    ]

    return this.fetchEvents(filters)
  }

  private bindRelayEvents(): void {
    this.client.on(RelayEvent.Connect, (relayUrl) => {
      this.logger.info("[community-relay] connected", {
        spaceId: this.space.id,
        relayUrl,
      })
    })

    this.client.on(RelayEvent.Disconnect, (relayUrl) => {
      this.logger.warn("[community-relay] disconnected", {
        spaceId: this.space.id,
        relayUrl,
      })
    })

    this.client.on(RelayEvent.Notice, (relayUrl, notice) => {
      this.logger.warn("[community-relay] notice", {
        spaceId: this.space.id,
        relayUrl,
        notice,
      })
    })

    this.client.on(RelayEvent.Error, (relayUrl, error) => {
      this.logger.error("[community-relay] error", {
        spaceId: this.space.id,
        relayUrl,
        error,
      })
    })

    this.client.on(RelayEvent.Auth, (relayUrl, challenge) => {
      if (!this.autoAuthenticate) {
        this.logger.warn("[community-relay] auth challenge received with auto-auth disabled", {
          spaceId: this.space.id,
          relayUrl,
        })
        return
      }

      this.pendingAuthPromise = this.authenticate(relayUrl, challenge).catch((error) => {
        const wrapped = error instanceof CommunityError
          ? error
          : this.wrapRelayError("authenticate", error, { relayUrl })

        this.logger.error("[community-relay] auth failed", {
          code: wrapped.code,
          message: wrapped.message,
          context: wrapped.context,
        })
        throw wrapped
      })
    })
  }

  private requireRoom(roomId: string): CommunityRoomConfig {
    const room = getCommunityRoomForSpace(roomId, this.space)
    if (!room) {
      throw new CommunityError(
        "relay_error",
        `Unknown community room "${roomId}".`,
        {
          operation: "fetch",
          roomId,
          spaceId: this.space.id,
          relayUrl: this.space.relayUrl,
        }
      )
    }
    return room
  }

  private wrapRelayError(
    operation: "connect" | "authenticate" | "fetch" | "publish" | "subscribe",
    error: unknown,
    extra: Partial<Pick<CommunityError["context"], "roomId" | "relayUrl" | "pubkey" | "details">> = {}
  ): CommunityError {
    const message = getErrorMessage(error)
    const code = classifyRelayError(message, operation)

    return new CommunityError(
      code,
      `Community relay ${operation} failed: ${message}`,
      {
        operation,
        spaceId: this.space.id,
        relayUrl: extra.relayUrl ?? this.space.relayUrl,
        roomId: extra.roomId,
        pubkey: extra.pubkey,
        details: extra.details ?? error,
      },
      error
    )
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Unknown relay error"
}

function classifyRelayError(
  message: string,
  operation: "connect" | "authenticate" | "fetch" | "publish" | "subscribe"
) {
  const normalized = message.toLowerCase()

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "relay_timeout" as const
  }

  if (
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("network") ||
    normalized.includes("websocket is not open") ||
    normalized.includes("failed to connect") ||
    normalized.includes("connection closed")
  ) {
    return "relay_unreachable" as const
  }

  if (operation === "authenticate" || normalized.includes("auth")) {
    return "auth_failed" as const
  }

  return "relay_error" as const
}
