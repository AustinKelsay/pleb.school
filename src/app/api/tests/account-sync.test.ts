import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "../account/sync/route"

const mockGetServerSession = vi.mocked(getServerSession)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockUserFindUnique = vi.mocked(prisma.user.findUnique)
const mockUserUpdate = vi.mocked(prisma.user.update)

describe("POST /api/account/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null as any)

    const request = new Request("http://localhost/api/account/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github" }),
    })

    const response = await POST(request as any)

    expect(response.status).toBe(401)
  })

  it("backfills email when email provider is linked but user email is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any)
    mockAccountFindFirst.mockResolvedValue({
      id: "acc-1",
      provider: "email",
      providerAccountId: "User@example.com",
    } as any)
    mockUserFindUnique.mockResolvedValue({ email: null } as any)
    mockUserUpdate.mockResolvedValue({} as any)

    const request = new Request("http://localhost/api/account/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "email" }),
    })

    const response = await POST(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.updated).toEqual(["email"])
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { email: true },
    })
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "user@example.com" },
    })
  })
})
