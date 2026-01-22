import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("@/lib/nostr-profile", () => ({
  fetchNostrProfile: vi.fn(),
  syncUserProfileFromNostr: vi.fn(),
}))

import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { fetchNostrProfile, syncUserProfileFromNostr } from "@/lib/nostr-profile"
import { POST } from "../profile/sync/route"

const mockGetServerSession = vi.mocked(getServerSession)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockUserUpdate = vi.mocked(prisma.user.update)
const mockFetchNostrProfile = vi.mocked(fetchNostrProfile)
const mockSyncUserProfileFromNostr = vi.mocked(syncUserProfileFromNostr)

describe("POST /api/profile/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("syncs enhanced fields only for OAuth-first users on Nostr provider", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      pubkey: "pubkey-1",
      profileSource: "oauth",
      primaryProvider: "github",
      accounts: [],
      nip05: null,
      lud16: null,
      banner: null,
    } as any)

    mockFetchNostrProfile.mockResolvedValue({
      nip05: "alice@example.com",
      lud16: "alice@getalby.com",
      banner: "https://example.com/banner.jpg",
    })

    mockUserUpdate.mockResolvedValue({
      nip05: "alice@example.com",
      lud16: "alice@getalby.com",
      banner: "https://example.com/banner.jpg",
      email: null,
      avatar: null,
      username: null,
    } as any)

    const request = new Request("http://localhost/api/profile/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "nostr" }),
    })

    const response = await POST(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.message).toMatch(/enhanced fields/i)
    expect(mockSyncUserProfileFromNostr).not.toHaveBeenCalled()
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: {
          nip05: "alice@example.com",
          lud16: "alice@getalby.com",
          banner: "https://example.com/banner.jpg",
        },
      })
    )
  })
})
