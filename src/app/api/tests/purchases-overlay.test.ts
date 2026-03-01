import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

vi.mock("@/lib/db-adapter", () => ({
  PurchaseAdapter: {
    findByUserWithResourcesOrCourses: vi.fn(),
  },
}))

import { getServerSession } from "next-auth"
import { PurchaseAdapter } from "@/lib/db-adapter"
import { POST } from "../purchases/overlay/route"

const mockGetServerSession = vi.mocked(getServerSession)
const mockFindByUserWithResourcesOrCourses = vi.mocked(PurchaseAdapter.findByUserWithResourcesOrCourses)

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/purchases/overlay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/purchases/overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns an empty private overlay when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null as any)

    const response = await POST(createRequest({ resourceIds: ["r1"] }) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body).toEqual({ resources: {}, courses: {} })
    expect(mockFindByUserWithResourcesOrCourses).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid payloads", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)

    const response = await POST(createRequest({ resourceIds: "not-an-array" }) as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.error).toBe("Invalid request payload")
    expect(mockFindByUserWithResourcesOrCourses).not.toHaveBeenCalled()
  })

  it("short-circuits when no IDs are provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)

    const response = await POST(createRequest({ resourceIds: [], courseIds: [] }) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ resources: {}, courses: {} })
    expect(mockFindByUserWithResourcesOrCourses).not.toHaveBeenCalled()
  })

  it("returns 400 when combined unique IDs exceed the shared limit", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    const resourceIds = Array.from({ length: 300 }, (_, index) => `r-${index}`)
    const courseIds = Array.from({ length: 250 }, (_, index) => `c-${index}`)

    const response = await POST(createRequest({ resourceIds, courseIds }) as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.error).toBe("Invalid request payload")
    expect(mockFindByUserWithResourcesOrCourses).not.toHaveBeenCalled()
  })

  it("returns 400 when resource and course arrays overlap but total lookup IDs exceed limit", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    const overlappingIds = Array.from({ length: 500 }, (_, index) => `id-${index}`)

    const response = await POST(
      createRequest({ resourceIds: overlappingIds, courseIds: overlappingIds }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.error).toBe("Invalid request payload")
    expect(mockFindByUserWithResourcesOrCourses).not.toHaveBeenCalled()
  })

  it("returns a private non-cacheable 500 response on adapter failures", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    mockFindByUserWithResourcesOrCourses.mockRejectedValue(new Error("db down"))

    const response = await POST(createRequest({ resourceIds: ["r1"] }) as any)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(body.error).toBe("Failed to fetch purchases overlay")
  })

  it("returns grouped purchases for requested resource/course IDs", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    mockFindByUserWithResourcesOrCourses.mockResolvedValue([
      {
        id: "p1",
        amountPaid: 2100,
        priceAtPurchase: 2100,
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        updatedAt: new Date("2026-03-01T10:00:00.000Z"),
        resourceId: "r1",
        courseId: null,
      },
      {
        id: "p2",
        amountPaid: 5500,
        priceAtPurchase: null,
        createdAt: new Date("2026-03-01T10:01:00.000Z"),
        updatedAt: new Date("2026-03-01T10:01:00.000Z"),
        resourceId: null,
        courseId: "c1",
      },
    ] as any)

    const response = await POST(
      createRequest({ resourceIds: ["r1", "r1", " "], courseIds: ["c1"] }) as any
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(mockFindByUserWithResourcesOrCourses).toHaveBeenCalledWith("user-1", ["r1"], ["c1"])
    expect(body.resources.r1).toHaveLength(1)
    expect(body.resources.r1[0]).toMatchObject({
      id: "p1",
      amountPaid: 2100,
      priceAtPurchase: 2100,
    })
    expect(body.courses.c1).toHaveLength(1)
    expect(body.courses.c1[0]).toMatchObject({
      id: "p2",
      amountPaid: 5500,
    })
  })
})
