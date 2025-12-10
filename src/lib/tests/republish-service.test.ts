import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32)
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

const mockFindResource = vi.fn()
const mockFindCourse = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: {
      findUnique: mockFindResource,
      update: vi.fn(),
    },
    course: {
      findUnique: mockFindCourse,
      update: vi.fn(),
    },
    $transaction: async (cb: any) =>
      cb({
        resource: { update: vi.fn() },
        course: { update: vi.fn() },
        lesson: { create: vi.fn() },
        draftLesson: { deleteMany: vi.fn(), updateMany: vi.fn() },
      }),
  },
}))

vi.mock("@/lib/nostr-relays", () => ({
  getRelays: () => ["wss://relay.test"],
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: vi.fn().mockReturnValue({ id: "event1", pubkey: "pub1", tags: [["d", "resource1"]] }),
  createCourseEvent: vi.fn().mockReturnValue({ id: "event2", pubkey: "pub1", tags: [["d", "course1"]] }),
  extractNoteId: (event: any) => event.id,
}))

vi.mock("@/data/types", () => ({
  parseCourseEvent: (evt: any) => ({ price: "0", type: "document", videoUrl: null }),
  parseEvent: (evt: any) => ({ price: "0", type: "document", videoUrl: null }),
}))

vi.mock("@/lib/additional-links", () => ({
  normalizeAdditionalLinks: (links: any) => links,
}))

describe("RepublishService privkey handling", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockFindResource.mockReset()
    mockFindCourse.mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("rejects plaintext privkeys under encryption for resources", async () => {
    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      price: 0,
      topics: [],
      type: "document",
      user: { id: "user1", privkey: HEX_PRIVKEY, pubkey: "pub1", role: { admin: false } },
    })

    const { RepublishService, RepublishError } = await import("../republish-service")

    await expect(
      RepublishService.republishResource("resource1", "user1", {
        title: "t",
        summary: "s",
        content: "c",
        price: 0,
        topics: [],
        additionalLinks: [],
        type: "document",
      })
    ).rejects.toMatchObject({ code: "PRIVKEY_INVALID" })
  })

  it("rejects plaintext privkeys under encryption for courses", async () => {
    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      noteId: null,
      user: { id: "user1", privkey: HEX_PRIVKEY, pubkey: "pub1", role: { admin: false } },
      lessons: [
        {
          id: "lesson1",
          resourceId: "res1",
          resource: { user: { pubkey: "pub1" } },
          draftId: null,
          draft: null,
          index: 0,
        },
      ],
    })

    const { RepublishService, RepublishError } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("course1", "user1", {
        title: "t",
        summary: "s",
        price: 0,
        topics: [],
      })
    ).rejects.toMatchObject({ code: "PRIVKEY_INVALID" })
  })
})
