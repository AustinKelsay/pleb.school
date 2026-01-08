import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32)
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

const mockFindDraft = vi.fn()
const mockPrismaFindUser = vi.fn()

vi.mock("@/lib/draft-service", () => ({
  DraftService: {
    findById: mockFindDraft,
  },
  CourseDraftService: {
    findById: vi.fn(),
    syncPublishedLessons: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockPrismaFindUser,
    },
  },
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: vi.fn(),
  createCourseEvent: vi.fn(),
  extractNoteId: vi.fn(),
}))

vi.mock("@/lib/nostr-relays", () => ({
  DEFAULT_RELAYS: ["wss://relay.test"],
  getRelays: () => ["wss://relay.test"],
}))

describe("PublishService privkey handling", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockFindDraft.mockReset()
    mockPrismaFindUser.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("rejects plaintext privkeys under encryption (strict default) with PRIVKEY_NOT_AVAILABLE", async () => {
    mockFindDraft.mockResolvedValue({ id: "draft1", userId: "user1" })
    mockPrismaFindUser.mockResolvedValue({ privkey: HEX_PRIVKEY, pubkey: "pub1" })

    const { PublishService, PublishError } = await import("../publish-service")

    await expect(PublishService.publishResource("draft1", "user1")).rejects.toMatchObject({
      code: "PRIVKEY_NOT_AVAILABLE",
    })
  })
})
