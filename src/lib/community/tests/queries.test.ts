import { beforeEach, describe, expect, it, vi } from "vitest"

const mockReduceCommunityGroupState = vi.fn()
const mockCreateSpaceMembership = vi.fn()
const mockCreateRoomMembership = vi.fn()
const mockSortEventsNewestFirst = vi.fn()
const mockParseCommunityMessage = vi.fn()

vi.mock("@/lib/community/reducers", () => ({
  reduceCommunityGroupState: (...args: unknown[]) => mockReduceCommunityGroupState(...args),
  createSpaceMembership: (...args: unknown[]) => mockCreateSpaceMembership(...args),
  createRoomMembership: (...args: unknown[]) => mockCreateRoomMembership(...args),
}))

vi.mock("@/lib/community/events", () => ({
  COMMUNITY_MESSAGE_KIND: 1,
  parseCommunityMessage: (...args: unknown[]) => mockParseCommunityMessage(...args),
  sortEventsNewestFirst: (...args: unknown[]) => mockSortEventsNewestFirst(...args),
}))

import { loadCommunityRoomData, loadCommunitySpaceData } from "@/lib/community/queries"

describe("community queries", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockReduceCommunityGroupState.mockImplementation((_events, groupId: string) => ({
      groupId,
      metadata: {
        id: groupId,
        name: `${groupId} name`,
        about: `${groupId} about`,
        isPrivate: false,
        isRestricted: false,
        isHidden: false,
        isClosed: false,
      },
      admins: [{ pubkey: "admin-1", label: "admin", permissions: ["*"] }],
      memberPubkeys: ["viewer-pubkey"],
      membershipStatus: "granted",
    }))

    mockCreateSpaceMembership.mockReturnValue({
      spaceId: "pleb-school",
      pubkey: "viewer-pubkey",
      status: "granted",
      isMember: true,
    })

    mockCreateRoomMembership.mockReturnValue({
      spaceId: "pleb-school",
      roomId: "general",
      pubkey: "viewer-pubkey",
      status: "pending",
      isMember: false,
      inheritedFromSpace: false,
    })

    mockSortEventsNewestFirst.mockImplementation((events) => events)
    mockParseCommunityMessage.mockImplementation((event: { parsed: unknown }) => event.parsed)
  })

  it("inherits room access from the space when no room-specific membership signals exist", async () => {
    const relayService = {
      fetchGroupStateEvents: vi.fn().mockResolvedValue([{ kind: 39000 }]),
      fetchRoomMessages: vi.fn().mockResolvedValue([
        {
          parsed: {
            id: "msg-1",
            pubkey: "viewer-pubkey",
            content: "hello",
            createdAt: 1,
            groupId: "pleb-school-general",
            isProtected: false,
          },
        },
      ]),
    } as any

    const result = await loadCommunityRoomData({
      relayService,
      viewer: {
        userId: "user-1",
        pubkey: "viewer-pubkey",
        provider: "github",
        isAuthenticated: true,
        canServerSign: true,
      },
      roomId: "general",
      limit: 10,
    })

    expect(result.membership).toEqual({
      status: "granted",
      isMember: true,
      inheritedFromSpace: true,
    })
    expect(result.spaceMembership).toEqual({
      status: "granted",
      isMember: true,
    })
    expect(mockCreateRoomMembership).not.toHaveBeenCalled()
  })

  it("uses room-specific membership state when the relay returns room membership signals", async () => {
    const relayService = {
      fetchGroupStateEvents: vi
        .fn()
        .mockResolvedValueOnce([{ kind: 9021 }])
        .mockResolvedValueOnce([{ kind: 39000 }]),
      fetchRoomMessages: vi.fn().mockResolvedValue([
        {
          parsed: {
            id: "msg-3",
            pubkey: "viewer-pubkey",
            content: "third",
            createdAt: 3,
            groupId: "pleb-school-general",
            isProtected: false,
          },
        },
        {
          parsed: {
            id: "msg-2",
            pubkey: "viewer-pubkey",
            content: "second",
            createdAt: 2,
            groupId: "pleb-school-general",
            isProtected: false,
          },
        },
        {
          parsed: {
            id: "msg-1",
            pubkey: "viewer-pubkey",
            content: "first",
            createdAt: 1,
            groupId: "pleb-school-general",
            isProtected: false,
          },
        },
      ]),
    } as any

    const result = await loadCommunityRoomData({
      relayService,
      viewer: {
        userId: "user-1",
        pubkey: "viewer-pubkey",
        provider: "github",
        isAuthenticated: true,
        canServerSign: true,
      },
      roomId: "general",
      limit: 2,
    })

    expect(mockCreateRoomMembership).toHaveBeenCalledOnce()
    expect(result.membership).toEqual({
      status: "pending",
      isMember: false,
      inheritedFromSpace: false,
    })
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]?.id).toBe("msg-3")
    expect(result.messages[1]?.id).toBe("msg-2")
  })

  it("resolves rooms from the supplied space override", async () => {
    const relayService = {
      fetchGroupStateEvents: vi.fn().mockResolvedValue([{ kind: 39000 }]),
      fetchRoomMessages: vi.fn().mockResolvedValue([]),
    } as any

    const result = await loadCommunityRoomData({
      relayService,
      viewer: {
        userId: "user-1",
        pubkey: "viewer-pubkey",
        provider: "github",
        isAuthenticated: true,
        canServerSign: true,
      },
      roomId: "custom-room",
      limit: 10,
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
      },
    })

    expect(result.room.id).toBe("custom-room")
    expect(result.room.groupId).toBe("custom-room-group")
    expect(result.membership).toEqual({
      status: "granted",
      isMember: true,
      inheritedFromSpace: true,
    })
    expect(mockCreateRoomMembership).not.toHaveBeenCalled()
    expect(relayService.fetchGroupStateEvents).toHaveBeenCalledWith("custom-room-group", "viewer-pubkey")
  })

  it("inherits room membership from the space in space summaries when a room has no room-specific membership signals", async () => {
    const relayService = {
      fetchGroupStateEvents: vi
        .fn()
        .mockResolvedValueOnce([{ kind: 39000 }])
        .mockResolvedValueOnce([{ kind: 39000 }]),
    } as any

    const result = await loadCommunitySpaceData({
      relayService,
      viewer: {
        userId: "user-1",
        pubkey: "viewer-pubkey",
        provider: "github",
        isAuthenticated: true,
        canServerSign: true,
      },
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
      },
    })

    expect(result.rooms[0]?.membership).toEqual({
      status: "granted",
      isMember: true,
      inheritedFromSpace: true,
    })
    expect(mockCreateRoomMembership).toHaveBeenCalledOnce()
  })
})
