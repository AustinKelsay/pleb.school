import { beforeEach, describe, expect, it, vi } from "vitest"

const mockParseGroupMetadataEvent = vi.fn()
const mockReduceGroupAdmins = vi.fn()
const mockReduceGroupMembers = vi.fn()
const mockReduceGroupMembershipStatus = vi.fn()

vi.mock("snstr", () => ({
  GroupMembershipStatus: {
    Granted: "granted",
    Initial: "initial",
  },
  GROUP_METADATA_KIND: 39000,
  parseGroupMetadataEvent: (...args: unknown[]) => mockParseGroupMetadataEvent(...args),
  reduceGroupAdmins: (...args: unknown[]) => mockReduceGroupAdmins(...args),
  reduceGroupMembers: (...args: unknown[]) => mockReduceGroupMembers(...args),
  reduceGroupMembershipStatus: (...args: unknown[]) => mockReduceGroupMembershipStatus(...args),
}))

import {
  createRoomMembership,
  createSpaceMembership,
  pickLatestEvent,
  reduceCommunityGroupState,
} from "@/lib/community/reducers"

describe("community reducers", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockParseGroupMetadataEvent.mockReturnValue({
      name: "General",
      about: "About general",
    })
    mockReduceGroupAdmins.mockReturnValue([{ pubkey: "admin-1", label: "Admin", permissions: ["*"] }])
    mockReduceGroupMembers.mockReturnValue(["member-1", "member-2"])
    mockReduceGroupMembershipStatus.mockReturnValue("granted")
  })

  it("pickLatestEvent filters by kind and d tag and chooses the newest event", () => {
    const event = pickLatestEvent([
      {
        id: "older-match",
        kind: 39000,
        created_at: 10,
        tags: [["d", "group-1"]],
      },
      {
        id: "wrong-group",
        kind: 39000,
        created_at: 99,
        tags: [["d", "group-2"]],
      },
      {
        id: "wrong-kind",
        kind: 1,
        created_at: 100,
        tags: [["d", "group-1"]],
      },
      {
        id: "newer-match",
        kind: 39000,
        created_at: 20,
        tags: [["d", "group-1"]],
      },
    ] as any, 39000, "group-1")

    expect(event?.id).toBe("newer-match")
  })

  it("reduceCommunityGroupState aggregates parsed metadata, admins, members, and membership status", () => {
    const result = reduceCommunityGroupState([
      {
        id: "meta-1",
        kind: 39000,
        created_at: 10,
        tags: [["d", "group-1"]],
      },
      {
        id: "meta-2",
        kind: 39000,
        created_at: 20,
        tags: [["d", "group-1"]],
      },
    ] as any, "group-1", "viewer-pubkey")

    expect(mockParseGroupMetadataEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "meta-2" }))
    expect(mockReduceGroupAdmins).toHaveBeenCalledWith(expect.any(Array), "group-1")
    expect(mockReduceGroupMembers).toHaveBeenCalledWith(expect.any(Array), "group-1")
    expect(mockReduceGroupMembershipStatus).toHaveBeenCalledWith(expect.any(Array), "viewer-pubkey", "group-1")
    expect(result).toEqual({
      groupId: "group-1",
      metadata: {
        name: "General",
        about: "About general",
      },
      admins: [{ pubkey: "admin-1", label: "Admin", permissions: ["*"] }],
      memberPubkeys: ["member-1", "member-2"],
      membershipStatus: "granted",
    })
  })

  it("createSpaceMembership and createRoomMembership derive membership flags from the reduced status", () => {
    mockReduceGroupMembershipStatus
      .mockReturnValueOnce("granted")
      .mockReturnValueOnce("initial")

    const spaceMembership = createSpaceMembership("space-1", "viewer-pubkey", [] as any, "group-1")
    const roomMembership = createRoomMembership({
      spaceId: "space-1",
      roomId: "room-1",
      pubkey: "viewer-pubkey",
      events: [] as any,
      groupId: "room-group-1",
      inheritedFromSpace: true,
    })

    expect(spaceMembership).toEqual({
      spaceId: "space-1",
      pubkey: "viewer-pubkey",
      status: "granted",
      isMember: true,
    })
    expect(roomMembership).toEqual({
      spaceId: "space-1",
      roomId: "room-1",
      pubkey: "viewer-pubkey",
      status: "initial",
      isMember: false,
      inheritedFromSpace: true,
    })
  })
})
