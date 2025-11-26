import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasPermission } from "@/lib/admin-utils"
import { parseBolt11Invoice } from "@/lib/bolt11"
import type { Prisma } from "@prisma/client"

type Scope = "mine" | "all"

type TraceStep = {
  label: string
  detail?: string
  at?: string | null
  kind?: "info" | "success" | "warning" | "error"
}

type ReceiptSummary = {
  id: string
  amountSats: number | null
  bolt11?: string | null
  payerPubkey?: string | null
  createdAt?: number | null
  description?: string | null
  raw?: any
}

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

  // Last updated - only show if the DB record was updated significantly after the unlock
  const effectiveUnlockTime = Math.max(updatedAt.getTime(), latestReceiptMs)
  if (updatedAt.getTime() - createdAt.getTime() > 1000 && updatedAt.getTime() > effectiveUnlockTime) {
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
      const canView = await hasPermission(session, "viewAnalytics")
      if (!canView) {
        return NextResponse.json({ error: "Admin analytics permission required" }, { status: 403 })
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

    // Fetch a lightweight set for platform stats (no limit).
    const purchasesForStats = await prisma.purchase.findMany({
      where,
      select: {
        id: true,
        userId: true,
        amountPaid: true,
        paymentType: true,
        course: {
          select: { price: true }
        },
        resource: {
          select: { price: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })

  const toMeta = (purchase: typeof purchases[number]) => {
    const contentType = purchase.courseId ? "course" : "resource"
    const priceSats = purchase.course?.price ?? purchase.resource?.price ?? 0
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

    const statsTotals = purchasesForStats.reduce(
      (acc, purchase) => {
        const priceSats = purchase.course?.price ?? purchase.resource?.price ?? 0
        const isRefund = purchase.paymentType === "refund"
        const status = isRefund
          ? "refunded"
          : purchase.amountPaid >= priceSats
            ? "unlocked"
            : "partial"

        acc.totalPurchases += 1
        acc.totalRevenueSats += purchase.amountPaid ?? 0
        if (status === "unlocked") acc.unlockedCount += 1
        if (status === "partial") acc.partialCount += 1
        if (isRefund) acc.refundCount += 1
        acc.buyerIds.add(purchase.userId)
        return acc
      },
      {
        totalPurchases: 0,
        totalRevenueSats: 0,
        unlockedCount: 0,
        partialCount: 0,
        refundCount: 0,
        buyerIds: new Set<string>()
      }
    )

    const stats = {
      totalPurchases: statsTotals.totalPurchases,
      totalRevenueSats: statsTotals.totalRevenueSats,
      unlockedCount: statsTotals.unlockedCount,
      partialCount: statsTotals.partialCount,
      refundCount: statsTotals.refundCount,
      buyers: statsTotals.buyerIds.size,
      averageTicketSats: statsTotals.totalPurchases
        ? Math.floor(statsTotals.totalRevenueSats / statsTotals.totalPurchases)
        : 0
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
