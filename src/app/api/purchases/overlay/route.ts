import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"

import { authOptions } from "@/lib/auth"
import { PurchaseAdapter } from "@/lib/db-adapter"

const requestSchema = z.object({
  resourceIds: z.array(z.string().min(1)).max(500).optional().default([]),
  courseIds: z.array(z.string().min(1)).max(500).optional().default([]),
})
const MAX_TOTAL_UNIQUE_IDS = 500
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const

type PurchaseSummary = {
  id: string
  amountPaid?: number
  priceAtPurchase?: number
  createdAt?: string
  updatedAt?: string
}

type OverlayResponse = {
  resources: Record<string, PurchaseSummary[]>
  courses: Record<string, PurchaseSummary[]>
}

function emptyOverlayResponse(): OverlayResponse {
  return {
    resources: {},
    courses: {},
  }
}

function uniqueNonEmptyIds(ids: string[]): string[] {
  const unique = new Set(
    ids
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  )
  return Array.from(unique)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(emptyOverlayResponse(), {
        headers: NO_STORE_HEADERS,
      })
    }

    const requestBody = await request.json().catch(() => null)
    const parsedBody = requestSchema.safeParse(requestBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsedBody.error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const resourceIds = uniqueNonEmptyIds(parsedBody.data.resourceIds)
    const courseIds = uniqueNonEmptyIds(parsedBody.data.courseIds)
    const totalLookupIds = resourceIds.length + courseIds.length
    if (totalLookupIds > MAX_TOTAL_UNIQUE_IDS) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: [
            {
              message: `Combined unique IDs exceed limit of ${MAX_TOTAL_UNIQUE_IDS}`,
              path: ["resourceIds", "courseIds"],
            },
          ],
        },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    if (resourceIds.length === 0 && courseIds.length === 0) {
      return NextResponse.json(emptyOverlayResponse(), {
        headers: NO_STORE_HEADERS,
      })
    }

    const purchases = await PurchaseAdapter.findByUserWithResourcesOrCourses(
      session.user.id,
      resourceIds,
      courseIds
    )

    const response = emptyOverlayResponse()

    purchases.forEach((purchase) => {
      const summary: PurchaseSummary = {
        id: purchase.id,
        amountPaid: purchase.amountPaid,
        priceAtPurchase: purchase.priceAtPurchase ?? undefined,
        createdAt: purchase.createdAt.toISOString(),
        updatedAt: purchase.updatedAt.toISOString(),
      }

      if (purchase.resourceId) {
        if (!response.resources[purchase.resourceId]) {
          response.resources[purchase.resourceId] = []
        }
        response.resources[purchase.resourceId].push(summary)
      }

      if (purchase.courseId) {
        if (!response.courses[purchase.courseId]) {
          response.courses[purchase.courseId] = []
        }
        response.courses[purchase.courseId].push(summary)
      }
    })

    return NextResponse.json(response, {
      headers: NO_STORE_HEADERS,
    })
  } catch (error) {
    console.error("Failed to fetch purchases overlay:", error)
    return NextResponse.json(
      { error: "Failed to fetch purchases overlay" },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
