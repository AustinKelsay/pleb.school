import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchase: {
      findMany: vi.fn(),
    },
  },
}))

import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "../purchases/overlay/route"

const mockGetServerSession = vi.mocked(getServerSession)
const mockFindMany = vi.mocked(prisma.purchase.findMany)

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
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid payloads", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)

    const response = await POST(createRequest({ resourceIds: "not-an-array" }) as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe("Invalid request payload")
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("short-circuits when no IDs are provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)

    const response = await POST(createRequest({ resourceIds: [], courseIds: [] }) as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ resources: {}, courses: {} })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("returns grouped purchases for requested resource/course IDs", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    mockFindMany.mockResolvedValue([
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
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          OR: [
            { resourceId: { in: ["r1"] } },
            { courseId: { in: ["c1"] } },
          ],
        }),
      })
    )
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
