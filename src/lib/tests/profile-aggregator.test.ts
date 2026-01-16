import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
}))

import { prisma } from "@/lib/prisma"
import { fetchNostrProfile } from "@/lib/nostr-profile"
import { getAggregatedProfile } from "../profile-aggregator"

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockUpdate = vi.mocked(prisma.user.update)
const mockFetchNostrProfile = vi.mocked(fetchNostrProfile)

describe("getAggregatedProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("prefers Nostr data when profileSource is nostr", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      username: "alice",
      avatar: null,
      email: null,
      pubkey: "pubkey-1",
      nip05: null,
      lud16: null,
      banner: null,
      primaryProvider: "nostr",
      profileSource: "nostr",
      accounts: [
        {
          provider: "nostr",
          providerAccountId: "pubkey-1",
        },
        {
          provider: "github",
          providerAccountId: "gh-1",
          access_token: "token-1",
        },
      ],
    } as any)

    mockFetchNostrProfile.mockResolvedValue({
      name: "nostr-name",
    })

    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ name: "gh-name", login: "gh-user" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const profile = await getAggregatedProfile("user-1")

    expect(profile.name?.value).toBe("nostr-name")
    expect(profile.name?.source).toBe("nostr")
  })

  it("replaces anonymous usernames with provider data and backfills user", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-2",
      username: "anon_1234",
      avatar: null,
      email: null,
      pubkey: null,
      nip05: null,
      lud16: null,
      banner: null,
      primaryProvider: "github",
      profileSource: "oauth",
      accounts: [
        {
          provider: "github",
          providerAccountId: "gh-2",
          access_token: "token-2",
        },
      ],
    } as any)

    mockFetchNostrProfile.mockResolvedValue(null)

    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ login: "octocat" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )

    const profile = await getAggregatedProfile("user-2")

    expect(profile.username?.value).toBe("octocat")
    expect(profile.username?.source).toBe("github")
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2" },
        data: expect.objectContaining({ username: "octocat" }),
      })
    )
  })
})
