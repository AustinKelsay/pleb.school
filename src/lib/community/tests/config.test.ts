import { describe, expect, it } from "vitest"
import {
  getCommunitiesConfig,
  getCommunitySpace,
  getCommunitySetupState,
  getDefaultCommunityRoom,
  mapSpaceConfigToSpace,
  parseCommunitiesConfig,
  resolveCommunityRoomGroupId,
} from "@/lib/community"

describe("community config", () => {
  it("parses the checked-in communities config", () => {
    const config = getCommunitiesConfig()

    expect(config.space.id).toBe("pleb-school")
    expect(config.space.isEnabled).toBe(false)
    expect(config.space.rooms).toHaveLength(2)
  })

  it("returns the configured default room", () => {
    const room = getDefaultCommunityRoom()

    expect(room.id).toBe("general")
    expect(room.isDefault).toBe(true)
  })

  it("maps room group ids with explicit room overrides", () => {
    const space = getCommunitySpace()
    const room = getDefaultCommunityRoom()

    expect(resolveCommunityRoomGroupId(room, space)).toBe("pleb-school-general")
  })

  it("maps config into app-facing space and room models", () => {
    const space = mapSpaceConfigToSpace()

    expect(space.isEnabled).toBe(false)
    expect(space.rooms[0]?.spaceId).toBe(space.id)
    expect(space.rooms[0]?.groupId).toBe("pleb-school-general")
  })

  it("marks the checked-in config as not set up while the placeholder relay is disabled", () => {
    const setupState = getCommunitySetupState()

    expect(setupState.isConfigured).toBe(false)
    expect(setupState.reasons).toContain("disabled")
    expect(setupState.reasons).toContain("placeholder_relay")
  })

  it("treats an enabled non-placeholder relay config as configured", () => {
    const config = parseCommunitiesConfig({
      space: {
        id: "live",
        name: "Live",
        enabled: true,
        relayUrl: "wss://relay.example.com",
        managementUrl: "https://relay.example.com",
        groupId: "live-space",
        requiresAuth: true,
        private: false,
        protected: false,
        rooms: [
          {
            id: "general",
            name: "General",
            default: true,
            requiresMembership: true,
            private: false,
            protected: false,
          },
        ],
      },
    })

    const setupState = getCommunitySetupState(config.space)

    expect(setupState.isConfigured).toBe(true)
    expect(setupState.reasons).toEqual([])
  })

  it("rejects configs without exactly one default room", () => {
    expect(() =>
      parseCommunitiesConfig({
        space: {
          id: "broken",
          name: "Broken",
          enabled: false,
          relayUrl: "wss://community.example.com",
          groupId: "broken",
          requiresAuth: true,
          private: false,
          protected: false,
          rooms: [
            {
              id: "one",
              name: "One",
              default: false,
            },
            {
              id: "two",
              name: "Two",
              default: false,
            },
          ],
        },
      })
    ).toThrow(/Exactly one room must be marked as default/)
  })
})
