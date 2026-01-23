import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasPermission } from "@/lib/admin-utils"
import { parseBolt11Invoice } from "@/lib/bolt11"
import { Prisma } from "@/generated/prisma"
import type { TraceStep, ReceiptSummary } from "@/types/purchases"

type Scope = "mine" | "all"

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return 200
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return 200
  return Math.min(parsed, 500)
}

function toReceiptArray(raw: unknown): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === "object") return [raw]
  return []
}

function extractZapRequestInfo(zapRequestJson: unknown): {
  signerPubkey?: string
  targetEventId?: string
  targetATag?: string
} {
  if (!zapRequestJson || typeof zapRequestJson !== "object") return {}
  
  const event = zapRequestJson as any
  const signerPubkey = typeof event.pubkey === "string" ? event.pubkey : undefined
  
  const tags: any[] = Array.isArray(event.tags) ? event.tags : []
  const eTag = tags.find((t) => Array.isArray(t) && t[0] === "e")
  const aTag = tags.find((t) => Array.isArray(t) && t[0] === "a")
  
  return {
    signerPubkey,
    targetEventId: eTag?.[1] ?? undefined,
    targetATag: aTag?.[1] ?? undefined
  }
}

function summarizeReceipt(event: any): ReceiptSummary {
  const id = typeof event?.id === "string" ? event.id : "unknown"
  const tags: any[] = Array.isArray(event?.tags) ? event.tags : []
  const amountTag = tags.find((t) => Array.isArray(t) && t[0] === "amount")
  const bolt11Tag = tags.find((t) => Array.isArray(t) && t[0] === "bolt11")
  const descriptionTag = tags.find((t) => Array.isArray(t) && t[0] === "description")
  const payerTag = tags.find((t) => Array.isArray(t) && t[0] === "P")

  let amountMsats: number | null = null
  if (amountTag?.[1]) {
    const parsed = Number(amountTag[1])
    if (Number.isFinite(parsed)) {
      amountMsats = parsed
    }
  }

  if (bolt11Tag?.[1]) {
    const parsedInvoice = parseBolt11Invoice(String(bolt11Tag[1]))
    const parsedMsats = parsedInvoice?.amountMsats
    if (typeof parsedMsats === "number" && Number.isFinite(parsedMsats)) {
      amountMsats = Math.max(amountMsats ?? 0, parsedMsats)
    }
  }

  const amountSats = amountMsats != null ? Math.max(0, Math.floor(amountMsats / 1000)) : null
  const payerPubkey = payerTag?.[1] ? String(payerTag[1]) : event?.pubkey ?? null
  const description = descriptionTag?.[1] ? String(descriptionTag[1]) : event?.content ?? null

  return {
    id,
    amountSats,
    bolt11: bolt11Tag?.[1] ? String(bolt11Tag[1]) : null,
    payerPubkey,
    createdAt: typeof event?.created_at === "number" ? event.created_at : null,
    description,
    raw: event
  }
}

function buildTrace(
  createdAt: Date,
  updatedAt: Date,
  status: string,
  priceSats: number,
  amountPaid: number,
  receipts: ReceiptSummary[],
  paymentType: string
): TraceStep[] {
  const steps: TraceStep[] = []

  // Purchase recorded - when the purchase row was first created
  steps.push({
    label: "Purchase recorded",
    detail: `${amountPaid.toLocaleString()} sats via ${paymentType}`,
    at: createdAt.toISOString(),
    kind: "success"
  })

  // Sort receipts newest-first for display, but keep all for timeline math
  const sortedReceipts = [...receipts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

  let latestReceiptMs = 0
  sortedReceipts.forEach((receipt) => {
    const receiptMs = receipt.createdAt ? receipt.createdAt * 1000 : 0
    if (receiptMs > latestReceiptMs) {
      latestReceiptMs = receiptMs
    }
  })

  // Show up to five most recent receipts in the trace
  sortedReceipts.slice(0, 5).forEach((receipt) => {
    const receiptTimestamp = receipt.createdAt ? new Date(receipt.createdAt * 1000).toISOString() : null

    steps.push({
      label: "Zap receipt verified",
      detail: `${receipt.amountSats?.toLocaleString() ?? ""} sats • ${receipt.id}`.trim(),
      at: receiptTimestamp,
      kind: "info"
    })
  })

  // Content unlock/partial status
  const unlocked = status === "unlocked"
  
  // Only show a separate unlock step if:
  // 1. It's a partial payment (always show progress), OR
  // 2. The server processed it noticeably after the last receipt (> 5 seconds difference)
  const serverProcessedLater = updatedAt.getTime() - latestReceiptMs > 5000
  const showUnlockStep = !unlocked || serverProcessedLater || latestReceiptMs === 0

  if (showUnlockStep) {
    // Use server timestamp if it's later, otherwise use latest receipt time
    const unlockTimeMs = Math.max(updatedAt.getTime(), latestReceiptMs)
    const unlockTimestamp = new Date(unlockTimeMs).toISOString()

    steps.push({
      label: unlocked ? "Content unlocked" : "Partial payment",
      detail: unlocked
        ? `Paid ${amountPaid.toLocaleString()} / ${priceSats.toLocaleString()} sats`
        : `Paid ${amountPaid.toLocaleString()} of ${priceSats.toLocaleString()} sats`,
      at: unlockTimestamp,
      kind: unlocked ? "success" : "warning"
    })
  }

  // Last updated - only show if the DB record was updated significantly after creation
  if (updatedAt.getTime() - createdAt.getTime() > 1000) {
    steps.push({
      label: "Last updated",
      detail: `Record updated after unlock`,
      at: updatedAt.toISOString(),
      kind: "info"
    })
  }

  return steps
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const scope: Scope = searchParams.get("scope") === "all" ? "all" : "mine"
    const limit = parseLimit(searchParams.get("limit"))

    if (scope === "all") {
      // Use viewPlatformAnalytics for all platform purchases
      const canView = await hasPermission(session, "viewPlatformAnalytics")
      if (!canView) {
        return NextResponse.json({ error: "Platform analytics permission required" }, { status: 403 })
      }
    }

    // User select shape; only admins get creator emails
    const userSelect = {
      id: true,
      username: true,
      pubkey: true,
      avatar: true,
      ...(scope === "all" ? { email: true } : {})
    }

    // Include creator user only for admins to avoid leaking contact info.
    const include: Prisma.PurchaseInclude = {
      resource: {
        select: {
          id: true,
          noteId: true,
          price: true,
          videoId: true,
          videoUrl: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          ...(scope === "all" ? { user: { select: userSelect } } : {})
        }
      },
      course: {
        select: {
          id: true,
          noteId: true,
          price: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { lessons: true }
          },
          ...(scope === "all" ? { user: { select: userSelect } } : {})
        }
      },
      // Buyer information (needed for privacy-zap detection); email only for admins.
      user: { select: userSelect }
    }

    const where = scope === "mine" ? { userId: session.user.id } : undefined

    const purchases = await prisma.purchase.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: limit
    })

    // Fetch aggregated platform stats server-side to avoid pulling every purchase into memory.
    const statsQuery = scope === "mine"
      ? prisma.$queryRaw<
          {
            totalPurchases: bigint
            totalRevenueSats: bigint
            unlockedCount: bigint
            partialCount: bigint
            refundCount: bigint
            buyers: bigint
          }[]
        >`
          SELECT
            COUNT(*)::bigint AS "totalPurchases",
            COALESCE(SUM(p."amountPaid"), 0)::bigint AS "totalRevenueSats",
            COALESCE(SUM(CASE WHEN p."paymentType" = 'refund' THEN 1 ELSE 0 END), 0)::bigint AS "refundCount",
            COALESCE(SUM(
              CASE
                WHEN p."paymentType" <> 'refund' AND p."amountPaid" >= LEAST(
                  COALESCE(NULLIF(p."priceAtPurchase", 0), COALESCE(c.price, r.price, 0)),
                  COALESCE(c.price, r.price, 0)
                ) THEN 1
                ELSE 0
              END
            ), 0)::bigint AS "unlockedCount",
            COALESCE(SUM(
              CASE
                WHEN p."paymentType" <> 'refund' AND p."amountPaid" < LEAST(
                  COALESCE(NULLIF(p."priceAtPurchase", 0), COALESCE(c.price, r.price, 0)),
                  COALESCE(c.price, r.price, 0)
                ) THEN 1
                ELSE 0
              END
            ), 0)::bigint AS "partialCount",
            COUNT(DISTINCT p."userId")::bigint AS "buyers"
          FROM "Purchase" p
          LEFT JOIN "Course" c ON p."courseId" = c.id
          LEFT JOIN "Resource" r ON p."resourceId" = r.id
          WHERE p."userId" = ${session.user.id}
        `
      : prisma.$queryRaw<
          {
            totalPurchases: bigint
            totalRevenueSats: bigint
            unlockedCount: bigint
            partialCount: bigint
            refundCount: bigint
            buyers: bigint
          }[]
        >`
          SELECT
            COUNT(*)::bigint AS "totalPurchases",
            COALESCE(SUM(p."amountPaid"), 0)::bigint AS "totalRevenueSats",
            COALESCE(SUM(CASE WHEN p."paymentType" = 'refund' THEN 1 ELSE 0 END), 0)::bigint AS "refundCount",
            COALESCE(SUM(
              CASE
                WHEN p."paymentType" <> 'refund' AND p."amountPaid" >= LEAST(
                  COALESCE(NULLIF(p."priceAtPurchase", 0), COALESCE(c.price, r.price, 0)),
                  COALESCE(c.price, r.price, 0)
                ) THEN 1
                ELSE 0
              END
            ), 0)::bigint AS "unlockedCount",
            COALESCE(SUM(
              CASE
                WHEN p."paymentType" <> 'refund' AND p."amountPaid" < LEAST(
                  COALESCE(NULLIF(p."priceAtPurchase", 0), COALESCE(c.price, r.price, 0)),
                  COALESCE(c.price, r.price, 0)
                ) THEN 1
                ELSE 0
              END
            ), 0)::bigint AS "partialCount",
            COUNT(DISTINCT p."userId")::bigint AS "buyers"
          FROM "Purchase" p
          LEFT JOIN "Course" c ON p."courseId" = c.id
          LEFT JOIN "Resource" r ON p."resourceId" = r.id
        `

    const statsRow = (await statsQuery)[0] ?? {
      totalPurchases: 0n,
      totalRevenueSats: 0n,
      unlockedCount: 0n,
      partialCount: 0n,
      refundCount: 0n,
      buyers: 0n
    }

    const toMeta = (purchase: typeof purchases[number]) => {
      const contentType = purchase.courseId ? "course" : "resource"
      const currentPrice = purchase.course?.price ?? purchase.resource?.price ?? 0
      const hasSnapshot = purchase.priceAtPurchase !== null && purchase.priceAtPurchase !== undefined && purchase.priceAtPurchase > 0
      const snapshot = hasSnapshot ? purchase.priceAtPurchase! : currentPrice
      const priceSats = Math.min(snapshot, currentPrice)
      const href = purchase.courseId
        ? `/courses/${purchase.courseId}`
        : purchase.resourceId
          ? `/content/${purchase.resourceId}`
          : undefined

      // Content metadata for display
      const contentId = purchase.courseId ?? purchase.resourceId ?? null
      const noteId = purchase.course?.noteId ?? purchase.resource?.noteId ?? null
      const videoId = purchase.resource?.videoId ?? null
      const videoUrl = purchase.resource?.videoUrl ?? null
      const lessonCount = (purchase.course as any)?._count?.lessons ?? null
      const creatorId = purchase.course?.userId ?? purchase.resource?.userId ?? null

      // Creator info (the content publisher)
      const creatorUser = (purchase.course as any)?.user ?? (purchase.resource as any)?.user ?? null
      const creator = creatorUser ? {
        id: creatorUser.id,
        username: creatorUser.username ?? null,
        email: creatorUser.email ?? null,
        avatar: creatorUser.avatar ?? null,
        pubkey: creatorUser.pubkey ?? null
      } : null

      // Generate thumbnail for videos from YouTube
      const thumbnail = videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : null

      // Extract zap request info (signer pubkey for privacy mode debugging)
      const zapRequestInfo = extractZapRequestInfo(purchase.zapRequestJson)

      const receipts = toReceiptArray(purchase.zapReceiptJson).map(summarizeReceipt)
      const receiptCount = receipts.length || (purchase.zapReceiptId ? 1 : 0)
      const receiptsTotal = receipts.reduce((sum, r) => sum + (r.amountSats ?? 0), 0)

      const status = purchase.paymentType === "refund"
        ? "refunded"
        : purchase.amountPaid >= priceSats
          ? "unlocked"
          : "partial"

      const lifeCycle = buildTrace(
        purchase.createdAt,
        purchase.updatedAt,
        status,
        priceSats,
        purchase.amountPaid,
        receipts,
        purchase.paymentType
      )

      // Check if this is a privacy-mode zap (signer pubkey differs from buyer pubkey)
      const buyerPubkey = (purchase as any).user?.pubkey ?? null
      const isPrivacyZap = zapRequestInfo.signerPubkey && 
        buyerPubkey && 
        zapRequestInfo.signerPubkey !== buyerPubkey

      return {
        ...purchase,
        contentType,
        priceSats,
        href,
        contentId,
        noteId,
        videoId,
        videoUrl,
        thumbnail,
        lessonCount,
        creatorId,
        creator,
        receiptCount,
        receiptsTotalSats: receiptsTotal,
        receipts,
        status,
        lifeCycle,
        // Zap request provenance
        zapSignerPubkey: zapRequestInfo.signerPubkey ?? null,
        isPrivacyZap: isPrivacyZap ?? false
      }
    }

    const purchasesWithMeta = purchases.map(toMeta)

    const totalPurchases = Number(statsRow.totalPurchases ?? 0n)
    const totalRevenueSats = Number(statsRow.totalRevenueSats ?? 0n)
    const unlockedCount = Number(statsRow.unlockedCount ?? 0n)
    const partialCount = Number(statsRow.partialCount ?? 0n)
    const refundCount = Number(statsRow.refundCount ?? 0n)
    const buyers = Number(statsRow.buyers ?? 0n)

    const stats = {
      totalPurchases,
      totalRevenueSats,
      unlockedCount,
      partialCount,
      refundCount,
      buyers,
      averageTicketSats: totalPurchases ? Math.floor(totalRevenueSats / totalPurchases) : 0
    }

    return NextResponse.json({
      success: true,
      data: {
        purchases: purchasesWithMeta,
        stats
      }
    })
  } catch (error) {
    console.error("Failed to fetch purchases", error)
    return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 })
  }
}
