import { validateAuthEvent } from "snstr"
import { describe, expect, it, vi } from "vitest"
import { CommunityRelayService, resolveCommunitySigner } from "@/lib/community"
import type { CommunitySpaceConfig } from "@/lib/community/types"

describe("CommunityRelayService", () => {
  it("creates a valid signed NIP-42 auth event with a local signer", async () => {
    const signer = await resolveCommunitySigner({
      privateKey: "1111111111111111111111111111111111111111111111111111111111111111",
    })

    const service = new CommunityRelayService({
      signer: signer.signer,
    })

    const event = await service.buildSignedAuthEvent("challenge-123")
    const isValid = await validateAuthEvent(event, {
      challenge: "challenge-123",
      relayUrl: service.getSpace().relayUrl,
    })

    expect(event.kind).toBe(22242)
    expect(isValid).toBe(true)
  })

  it("throws auth_unavailable when auth signing is requested without a signer", async () => {
    const service = new CommunityRelayService()

    await expect(service.buildSignedAuthEvent("challenge-123")).rejects.toMatchObject({
      code: "auth_unavailable",
    })
  })

  it("uses the service space override when fetching room messages", async () => {
    const service = new CommunityRelayService({
      space: {
        id: "custom-space",
        name: "Custom Space",
        isEnabled: true,
        relayUrl: "wss://relay.example.com",
        managementUrl: "https://relay.example.com",
        groupId: "custom-space-group",
        requiresAuth: true,
        isPrivate: false,
        isProtected: false,
        rooms: [
          {
            id: "custom-room",
            name: "Custom Room",
            groupId: "custom-room-group",
            isDefault: true,
            requiresMembership: true,
            isPrivate: false,
            isProtected: false,
          },
        ],
      } satisfies CommunitySpaceConfig,
    })

    const fetchEvents = vi.spyOn(service, "fetchEvents").mockResolvedValue([])

    await service.fetchRoomMessages("custom-room", [1])

    expect(fetchEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        kinds: [1],
        "#room": ["custom-room"],
      }),
    ])
  })
})
