import { describe, expect, it, vi } from "vitest"

const { MockNostr, mockAuthenticateRelay } = vi.hoisted(() => {
  const mockAuthenticateRelay = vi.fn()

  class MockNostr {
    private listeners = new Map<string, (...args: unknown[]) => void>()

    constructor(_relays: string[]) {}

    on(event: string, handler: (...args: unknown[]) => void) {
      this.listeners.set(event, handler)
    }

    async connectToRelays() {
      const authHandler = this.listeners.get("auth")
      if (authHandler) {
        authHandler("wss://relay.example.com", "challenge-123")
      }
    }

    authenticateRelay(...args: unknown[]) {
      return mockAuthenticateRelay(...args)
    }

    disconnectFromRelays() {}
    subscribe() { return [] }
    unsubscribe() {}
    fetchMany() { return Promise.resolve([]) }
    fetchOne() { return Promise.resolve(null) }
    publishWithDetails() {
      return Promise.resolve({
        success: true,
        event: {} as any,
        relayResults: new Map(),
        successCount: 1,
        failureCount: 0,
      })
    }
  }

  return {
    MockNostr,
    mockAuthenticateRelay,
  }
})

vi.mock("snstr", () => ({
  Nostr: MockNostr,
  RelayEvent: {
    Connect: "connect",
    Disconnect: "disconnect",
    Notice: "notice",
    Error: "error",
    Auth: "auth",
  },
  buildGroupContentFilters: () => [],
  buildGroupMembershipFilters: () => [],
  buildGroupMetadataFilters: () => [],
  createAuthEventTemplate: () => ({ kind: 22242, content: "", tags: [] }),
}))

import { CommunityRelayService } from "@/lib/community/relay-service"

describe("CommunityRelayService connect", () => {
  it("waits for relay authentication to finish before connect resolves", async () => {
    let releaseAuth: (() => void) | undefined
    mockAuthenticateRelay.mockImplementation(() =>
      new Promise((resolve) => {
        releaseAuth = () => resolve({ ok: true })
      })
    )

    const service = new CommunityRelayService({
      signer: {
        signEvent: async (template: unknown) => ({
          ...(template as Record<string, unknown>),
          id: "auth-event",
          pubkey: "viewer-pubkey",
          created_at: 1,
          sig: "sig",
        }),
      } as any,
    })

    let didResolve = false
    const connectPromise = service.connect().then(() => {
      didResolve = true
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockAuthenticateRelay).toHaveBeenCalledOnce()
    expect(didResolve).toBe(false)

    expect(releaseAuth).toBeDefined()
    releaseAuth?.()
    await connectPromise

    expect(didResolve).toBe(true)
  })
})
