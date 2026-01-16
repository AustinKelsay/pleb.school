import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32)
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

const mockFindResource = vi.fn()
const mockFindCourse = vi.fn()
const mockResourceUpdate = vi.fn()
const mockCourseUpdate = vi.fn()
const mockTransaction = vi.fn()
const mockCreateResourceEvent = vi.fn()
const mockCreateCourseEvent = vi.fn()
const mockRelayPoolPublish = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resource: {
      findUnique: mockFindResource,
      update: mockResourceUpdate,
    },
    course: {
      findUnique: mockFindCourse,
      update: mockCourseUpdate,
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: (cb: any) => mockTransaction(cb),
  },
}))

vi.mock("@/lib/nostr-relays", () => ({
  getRelays: () => ["wss://relay.test"],
}))

vi.mock("@/lib/nostr-events", () => ({
  createResourceEvent: (...args: any[]) => mockCreateResourceEvent(...args),
  createCourseEvent: (...args: any[]) => mockCreateCourseEvent(...args),
  extractNoteId: (event: any) => event.tags?.find((t: string[]) => t[0] === "d")?.[1] ?? event.id,
}))

vi.mock("@/data/types", () => ({
  parseCourseEvent: (evt: any) => ({ price: "0", type: "document", videoUrl: null }),
  parseEvent: (evt: any) => ({ price: "0", type: "document", videoUrl: null }),
}))

vi.mock("@/lib/additional-links", () => ({
  normalizeAdditionalLinks: (links: any) => links ?? [],
}))

vi.mock("snstr", () => {
  return {
    RelayPool: class MockRelayPool {
      publish(...args: any[]) {
        return mockRelayPoolPublish(...args)
      }
    },
  }
})

// Helper to create encrypted privkey (matches privkey-crypto encryption format)
async function createEncryptedPrivkey(plaintext: string): Promise<string> {
  const { encryptPrivkey } = await import("../privkey-crypto")
  return encryptPrivkey(plaintext)
}

function resetAllMocks() {
  mockFindResource.mockReset()
  mockFindCourse.mockReset()
  mockResourceUpdate.mockReset()
  mockCourseUpdate.mockReset()
  mockTransaction.mockReset()
  mockCreateResourceEvent.mockReset()
  mockCreateCourseEvent.mockReset()
  mockRelayPoolPublish.mockReset()
}

describe("RepublishService privkey handling", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetAllMocks()
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

describe("RepublishService happy path", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("republishes resource with encrypted privkey", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)
    const generatedEventId = "generated-event-id-123"

    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      price: 0,
      topics: [],
      type: "document",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
    })

    mockCreateResourceEvent.mockReturnValue({
      id: generatedEventId,
      pubkey: "pub1",
      kind: 30023,
      tags: [["d", "resource1"]],
      content: "test content",
      sig: "sig123",
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    const txUpdate = vi.fn()
    mockTransaction.mockImplementation(async (cb) => {
      return cb({ resource: { update: txUpdate }, course: { update: vi.fn() } })
    })

    const { RepublishService } = await import("../republish-service")

    const result = await RepublishService.republishResource("resource1", "user1", {
      title: "Test Title",
      summary: "Test Summary",
      content: "Test Content",
      price: 100,
      topics: ["bitcoin"],
      additionalLinks: [],
      type: "document",
    })

    expect(result.mode).toBe("server-sign")
    expect(result.noteId).toBe(generatedEventId)
    expect(result.event.id).toBe(generatedEventId)
    expect(mockCreateResourceEvent).toHaveBeenCalled()
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "resource1" },
        data: expect.objectContaining({ noteId: generatedEventId }),
      })
    )
  })

  it("republishes course with encrypted privkey and lessons", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)
    const generatedEventId = "course-event-id-456"

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      noteId: null,
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [
        {
          id: "lesson1",
          resourceId: "res1",
          resource: { user: { pubkey: "pub1" } },
          index: 0,
        },
        {
          id: "lesson2",
          resourceId: "res2",
          resource: { user: { pubkey: "pub2" } },
          index: 1,
        },
      ],
    })

    mockCreateCourseEvent.mockReturnValue({
      id: generatedEventId,
      pubkey: "pub1",
      kind: 30004,
      tags: [["d", "course1"], ["a", "30023:pub1:res1"], ["a", "30023:pub2:res2"]],
      content: "",
      sig: "sig456",
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    const txUpdate = vi.fn()
    mockTransaction.mockImplementation(async (cb) => {
      return cb({ resource: { update: vi.fn() }, course: { update: txUpdate } })
    })

    const { RepublishService } = await import("../republish-service")

    const result = await RepublishService.republishCourse("course1", "user1", {
      title: "Test Course",
      summary: "Course Summary",
      price: 500,
      topics: ["lightning"],
    })

    expect(result.mode).toBe("server-sign")
    expect(result.noteId).toBe(generatedEventId)
    expect(mockCreateCourseEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "course1", title: "Test Course" }),
      expect.arrayContaining([
        { resourceId: "res1", pubkey: "pub1" },
        { resourceId: "res2", pubkey: "pub2" },
      ]),
      expect.any(String)
    )
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course1" },
        data: expect.objectContaining({ noteId: generatedEventId, price: 500 }),
      })
    )
  })
})

describe("RepublishService event ID persistence", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("persists new event ID from createResourceEvent to database", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)
    const newEventId = "new-unique-event-id"

    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      price: 0,
      type: "document",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
    })

    mockCreateResourceEvent.mockReturnValue({
      id: newEventId,
      pubkey: "pub1",
      tags: [["d", "resource1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    const txUpdate = vi.fn()
    mockTransaction.mockImplementation(async (cb) => {
      return cb({ resource: { update: txUpdate }, course: { update: vi.fn() } })
    })

    const { RepublishService } = await import("../republish-service")

    const result = await RepublishService.republishResource("resource1", "user1", {
      title: "t", summary: "s", content: "c", price: 0, topics: [], additionalLinks: [], type: "document",
    })

    expect(result.noteId).toBe(newEventId)
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ noteId: newEventId }),
      })
    )
  })

  it("persists new event ID from createCourseEvent to database", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)
    const newEventId = "new-course-event-id"

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      noteId: "old-event-id",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [{ id: "l1", resourceId: "r1", resource: { user: { pubkey: "pub1" } }, index: 0 }],
    })

    mockCreateCourseEvent.mockReturnValue({
      id: newEventId,
      pubkey: "pub1",
      tags: [["d", "course1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    const txUpdate = vi.fn()
    mockTransaction.mockImplementation(async (cb) => {
      return cb({ resource: { update: vi.fn() }, course: { update: txUpdate } })
    })

    const { RepublishService } = await import("../republish-service")

    const result = await RepublishService.republishCourse("course1", "user1", {
      title: "t", summary: "s", price: 0, topics: [],
    })

    expect(result.noteId).toBe(newEventId)
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ noteId: newEventId }),
      })
    )
  })
})

describe("RepublishService course lesson handling", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("builds lesson references from all course lessons", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [
        { id: "l1", resourceId: "res-a", resource: { user: { pubkey: "author1" } }, index: 0 },
        { id: "l2", resourceId: "res-b", resource: { user: { pubkey: "author2" } }, index: 1 },
        { id: "l3", resourceId: "res-c", resource: { user: { pubkey: "author1" } }, index: 2 },
      ],
    })

    mockCreateCourseEvent.mockReturnValue({
      id: "event1",
      pubkey: "pub1",
      tags: [["d", "course1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])
    mockTransaction.mockImplementation(async (cb) => cb({ course: { update: vi.fn() } }))

    const { RepublishService } = await import("../republish-service")

    await RepublishService.republishCourse("course1", "user1", {
      title: "t", summary: "s", price: 0, topics: [],
    })

    expect(mockCreateCourseEvent).toHaveBeenCalledWith(
      expect.anything(),
      [
        { resourceId: "res-a", pubkey: "author1" },
        { resourceId: "res-b", pubkey: "author2" },
        { resourceId: "res-c", pubkey: "author1" },
      ],
      expect.any(String)
    )
  })

  it("rejects course with missing lesson resources", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [
        { id: "l1", resourceId: null, resource: null, index: 0 },
      ],
    })

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("course1", "user1", {
        title: "t", summary: "s", price: 0, topics: [],
      })
    ).rejects.toMatchObject({ code: "MISSING_LESSONS" })
  })

  it("rejects course with no lessons", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      price: 0,
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [],
    })

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("course1", "user1", {
        title: "t", summary: "s", price: 0, topics: [],
      })
    ).rejects.toMatchObject({ code: "MISSING_LESSONS" })
  })
})

describe("RepublishService error scenarios", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.PRIVKEY_ENCRYPTION_KEY = BASE64_KEY
  })

  afterEach(() => {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("throws NOT_FOUND when resource does not exist", async () => {
    mockFindResource.mockResolvedValue(null)

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishResource("nonexistent", "user1", {
        title: "t", summary: "s", content: "c", price: 0, topics: [], additionalLinks: [], type: "document",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("throws NOT_FOUND when course does not exist", async () => {
    mockFindCourse.mockResolvedValue(null)

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("nonexistent", "user1", {
        title: "t", summary: "s", price: 0, topics: [],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("propagates createResourceEvent errors", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
    })

    mockCreateResourceEvent.mockImplementation(() => {
      throw new Error("Event signing failed")
    })

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishResource("resource1", "user1", {
        title: "t", summary: "s", content: "c", price: 0, topics: [], additionalLinks: [], type: "document",
      })
    ).rejects.toThrow("Event signing failed")
  })

  it("propagates createCourseEvent errors", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [{ id: "l1", resourceId: "r1", resource: { user: { pubkey: "pub1" } }, index: 0 }],
    })

    mockCreateCourseEvent.mockImplementation(() => {
      throw new Error("Course event signing failed")
    })

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("course1", "user1", {
        title: "t", summary: "s", price: 0, topics: [],
      })
    ).rejects.toThrow("Course event signing failed")
  })

  it("throws RELAY_PUBLISH_FAILED when all relays fail", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
    })

    mockCreateResourceEvent.mockReturnValue({
      id: "event1",
      pubkey: "pub1",
      tags: [["d", "resource1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.reject(new Error("Connection failed"))])

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishResource("resource1", "user1", {
        title: "t", summary: "s", content: "c", price: 0, topics: [], additionalLinks: [], type: "document",
      })
    ).rejects.toMatchObject({ code: "RELAY_PUBLISH_FAILED" })
  })

  it("propagates transaction errors for resources", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindResource.mockResolvedValue({
      id: "resource1",
      userId: "user1",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
    })

    mockCreateResourceEvent.mockReturnValue({
      id: "event1",
      pubkey: "pub1",
      tags: [["d", "resource1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    mockTransaction.mockRejectedValue(new Error("Database transaction failed"))

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishResource("resource1", "user1", {
        title: "t", summary: "s", content: "c", price: 0, topics: [], additionalLinks: [], type: "document",
      })
    ).rejects.toThrow("Database transaction failed")
  })

  it("propagates transaction errors for courses", async () => {
    const encryptedPrivkey = await createEncryptedPrivkey(HEX_PRIVKEY)

    mockFindCourse.mockResolvedValue({
      id: "course1",
      userId: "user1",
      user: { id: "user1", privkey: encryptedPrivkey, pubkey: "pub1", role: { admin: false } },
      lessons: [{ id: "l1", resourceId: "r1", resource: { user: { pubkey: "pub1" } }, index: 0 }],
    })

    mockCreateCourseEvent.mockReturnValue({
      id: "event1",
      pubkey: "pub1",
      tags: [["d", "course1"]],
    })

    mockRelayPoolPublish.mockReturnValue([Promise.resolve()])

    mockTransaction.mockRejectedValue(new Error("Course transaction failed"))

    const { RepublishService } = await import("../republish-service")

    await expect(
      RepublishService.republishCourse("course1", "user1", {
        title: "t", summary: "s", price: 0, topics: [],
      })
    ).rejects.toThrow("Course transaction failed")
  })
})
