import { afterEach, describe, expect, it, vi } from "vitest"

const { checkCourseUnlockViaLessonsMock } = vi.hoisted(() => ({
  checkCourseUnlockViaLessonsMock: vi.fn(),
}))

const { getResourceSnapshotMock } = vi.hoisted(() => ({
  getResourceSnapshotMock: vi.fn(),
}))

const { fetchResourceEventOnServerMock } = vi.hoisted(() => ({
  fetchResourceEventOnServerMock: vi.fn(),
}))

vi.mock("@/lib/course-access", () => ({
  checkCourseUnlockViaLessons: checkCourseUnlockViaLessonsMock,
}))

vi.mock("@/lib/db-adapter", () => ({
  ResourceAdapter: {
    getResourceSnapshot: getResourceSnapshotMock,
  },
}))

vi.mock("@/lib/resource-event-resolution", () => ({
  fetchResourceEventOnServer: fetchResourceEventOnServerMock,
}))

import { getResourcePageData } from "@/lib/resource-page-data.server"

describe("getResourcePageData", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses the stored noteId fallback when a UUID-backed resource exists", async () => {
    getResourceSnapshotMock.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: "user-1",
      price: 0,
      noteId: "a".repeat(64),
      user: null,
      lessons: [],
      purchases: [],
    })
    checkCourseUnlockViaLessonsMock.mockResolvedValue({
      unlockedViaCourse: false,
      unlockingCourseId: null,
    })
    fetchResourceEventOnServerMock.mockResolvedValue({
      resolved: null,
      event: {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: 1_700_000_000,
        kind: 30023,
        tags: [["d", "legacy-resource"]],
        content: "",
        sig: "c".repeat(128),
      },
      error: null,
    })

    const result = await getResourcePageData({
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      viewerUserId: null,
    })

    expect(fetchResourceEventOnServerMock).toHaveBeenCalledWith(
      "123e4567-e89b-12d3-a456-426614174000",
      "a".repeat(64)
    )
    expect(result.shouldNotFound).toBe(false)
    expect(result.initialMeta?.resourceNoteId).toBe("a".repeat(64))
    expect(result.event?.id).toBe("a".repeat(64))
  })

  it("keeps UUID-backed resources renderable when event recovery still misses", async () => {
    getResourceSnapshotMock.mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: "user-1",
      price: 0,
      noteId: "a".repeat(64),
      user: null,
      lessons: [],
      purchases: [],
    })
    checkCourseUnlockViaLessonsMock.mockResolvedValue({
      unlockedViaCourse: false,
      unlockingCourseId: null,
    })
    fetchResourceEventOnServerMock.mockResolvedValue({
      resolved: null,
      event: null,
      error: null,
    })

    const result = await getResourcePageData({
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      viewerUserId: null,
    })

    expect(result.shouldNotFound).toBe(false)
    expect(result.event).toBeNull()
    expect(result.initialMeta?.resourceNoteId).toBe("a".repeat(64))
  })

  it("returns notFound when the UUID-backed resource does not exist", async () => {
    getResourceSnapshotMock.mockResolvedValue(null)

    const result = await getResourcePageData({
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      viewerUserId: null,
    })

    expect(fetchResourceEventOnServerMock).not.toHaveBeenCalled()
    expect(result.shouldNotFound).toBe(true)
    expect(result.initialMeta).toBeNull()
    expect(result.event).toBeNull()
  })
})
