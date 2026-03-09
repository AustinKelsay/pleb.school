import { validateAuthEvent } from "snstr"
import { describe, expect, it } from "vitest"
import { CommunityRelayService, resolveCommunitySigner } from "@/lib/community"

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
})
