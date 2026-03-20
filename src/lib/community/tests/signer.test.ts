import { describe, expect, it } from "vitest"
import { resolveCommunitySigner } from "@/lib/community/signer"

describe("community signer", () => {
  it("wraps signer public key lookup failures in an auth_failed CommunityError", async () => {
    await expect(resolveCommunitySigner({
      signer: {
        getPublicKey: async () => {
          throw new Error("nip07 unavailable")
        },
        signEvent: async () => {
          throw new Error("not used")
        },
      } as any,
    })).rejects.toMatchObject({
      code: "auth_failed",
      message: expect.stringContaining("Failed to resolve community signer public key"),
    })
  })
})
