import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetCommunityViewerContext = vi.fn()
const mockCreateServerCommunityRelayServiceForUser = vi.fn()

vi.mock("@/lib/community/server", () => ({
  getCommunityViewerContext: (...args: unknown[]) => mockGetCommunityViewerContext(...args),
  createServerCommunityRelayServiceForUser: (...args: unknown[]) =>
    mockCreateServerCommunityRelayServiceForUser(...args),
}))

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { POST as postMembership } from "../membership/route"
import { POST as postMessage } from "../messages/route"

describe("community write routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects membership changes when the viewer is unauthenticated", async () => {
    mockGetCommunityViewerContext.mockResolvedValue({
      isAuthenticated: false,
      canServerSign: false,
    })

    const request = new Request("http://localhost/api/community/membership", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "join" }),
    })

    const response = await postMembership(request as any)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.code).toBe("auth_required")
    expect(mockCreateServerCommunityRelayServiceForUser).not.toHaveBeenCalled()
  })

  it("rejects invalid membership payloads with a validation error", async () => {
    mockGetCommunityViewerContext.mockResolvedValue({
      userId: "user-1",
      pubkey: "viewer-pubkey",
      provider: "github",
      isAuthenticated: true,
      canServerSign: true,
    })

    const request = new Request("http://localhost/api/community/membership", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "maybe" }),
    })

    const response = await postMembership(request as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe("validation_error")
    expect(mockCreateServerCommunityRelayServiceForUser).not.toHaveBeenCalled()
  })

  it("rejects message publish when the viewer is unauthenticated", async () => {
    mockGetCommunityViewerContext.mockResolvedValue({
      isAuthenticated: false,
      canServerSign: false,
    })

    const request = new Request("http://localhost/api/community/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomId: "general", content: "hello" }),
    })

    const response = await postMessage(request as any)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.code).toBe("auth_required")
    expect(mockCreateServerCommunityRelayServiceForUser).not.toHaveBeenCalled()
  })

  it("rejects invalid message payloads before attempting server-side signing", async () => {
    mockGetCommunityViewerContext.mockResolvedValue({
      userId: "user-1",
      pubkey: "viewer-pubkey",
      provider: "github",
      isAuthenticated: true,
      canServerSign: true,
    })

    const request = new Request("http://localhost/api/community/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomId: "general", content: "" }),
    })

    const response = await postMessage(request as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe("validation_error")
    expect(mockCreateServerCommunityRelayServiceForUser).not.toHaveBeenCalled()
  })

  it("returns 404 for unknown configured rooms before creating a relay signer", async () => {
    mockGetCommunityViewerContext.mockResolvedValue({
      userId: "user-1",
      pubkey: "viewer-pubkey",
      provider: "github",
      isAuthenticated: true,
      canServerSign: true,
    })

    const request = new Request("http://localhost/api/community/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomId: "unknown-room", content: "hello" }),
    })

    const response = await postMessage(request as any)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe("relay_error")
    expect(mockCreateServerCommunityRelayServiceForUser).not.toHaveBeenCalled()
  })
})
