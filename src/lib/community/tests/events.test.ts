import { describe, expect, it } from "vitest"
import {
  COMMUNITY_MESSAGE_KIND,
  createCommunityJoinRequestTemplate,
  createCommunityMessageTemplate,
  createSignedCommunityEvent,
  parseCommunityMessage,
  verifyCommunityEventSignature,
} from "@/lib/community/events"

describe("community events", () => {
  it("builds join request templates scoped to a group", () => {
    const template = createCommunityJoinRequestTemplate("pleb-school")

    expect(template.kind).toBe(9021)
    expect(template.tags?.[0]).toEqual(["h", "pleb-school"])
  })

  it("builds room message templates with room and protected tags", () => {
    const template = createCommunityMessageTemplate({
      groupId: "pleb-school-general",
      roomId: "general",
      content: "hello world",
      isProtected: true,
    })

    expect(template.kind).toBe(COMMUNITY_MESSAGE_KIND)
    expect(template.tags).toContainEqual(["h", "pleb-school-general"])
    expect(template.tags).toContainEqual(["room", "general"])
    expect(template.tags).toContainEqual(["-"])
  })

  it("creates signed community events with valid signatures", async () => {
    const template = createCommunityMessageTemplate({
      groupId: "pleb-school-general",
      roomId: "general",
      content: "hello world",
    })

    const event = await createSignedCommunityEvent(
      template,
      "1111111111111111111111111111111111111111111111111111111111111111"
    )

    const isValid = await verifyCommunityEventSignature(event)

    expect(isValid).toBe(true)
    expect(parseCommunityMessage(event).roomId).toBe("general")
  })
})
