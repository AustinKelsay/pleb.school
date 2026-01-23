"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"

import type { Purchase } from "@/generated/prisma"
import type { ZapReceiptSummary } from "./useInteractions"
import { normalizeHexPubkey } from "@/lib/nostr-keys"

type ClaimArgs = {
  zapReceiptId?: string
  zapReceiptIds?: string[]
  invoice?: string
  paymentType?: "zap" | "manual" | "comped" | "refund"
  amountPaidOverride?: number
  paymentPreimage?: string
  zapRequestJson?: any
  zapReceiptEvents?: any[]
  relayHints?: string[]
  // When true, uses extended age limit for "Unlock with past zaps" flow
  allowPastZaps?: boolean
}

type Status = "idle" | "pending" | "success" | "error"

export interface PurchaseEligibilityOptions {
  resourceId?: string
  courseId?: string
  priceSats: number
  viewerZapTotalSats: number
  alreadyPurchased?: boolean
  autoClaim?: boolean
  enabled?: boolean
  onAutoClaimSuccess?: (purchase: Purchase) => void
  onAutoClaimError?: (error: string) => void
  zapReceipts?: ZapReceiptSummary[]
  eventId?: string
  eventKind?: number
  eventIdentifier?: string
  eventPubkey?: string
}

export interface PurchaseEligibilityResult {
  eligible: boolean
  status: Status
  purchase: Purchase | null
  error: string | null
  claimPurchase: (args?: ClaimArgs) => Promise<Purchase | null>
  resetError: () => void
}

const DEFAULT_AUTO_CLAIM = true

export function usePurchaseEligibility(options: PurchaseEligibilityOptions): PurchaseEligibilityResult {
  const {
    resourceId,
    courseId,
    priceSats,
    viewerZapTotalSats,
    alreadyPurchased = false,
    autoClaim = DEFAULT_AUTO_CLAIM,
    enabled = true,
    onAutoClaimSuccess,
    onAutoClaimError,
    zapReceipts,
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey
  } = options

  const { status: sessionStatus, data: session } = useSession()
  const isAuthed = sessionStatus === "authenticated"
  const sessionPubkey = useMemo(() => normalizeHexPubkey(session?.user?.pubkey), [session?.user?.pubkey])

  const [status, setStatus] = useState<Status>("idle")
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoClaimedRef = useRef(false)
  const autoClaimCooldownRef = useRef<number>(0)
  const autoClaimFailCountRef = useRef(0)
  const onSuccessRef = useRef(onAutoClaimSuccess)
  const onErrorRef = useRef(onAutoClaimError)

  useEffect(() => {
    onSuccessRef.current = onAutoClaimSuccess
    onErrorRef.current = onAutoClaimError
  }, [onAutoClaimSuccess, onAutoClaimError])

  useEffect(() => {
    // Reset auto-claim sentinel when the user identity changes (e.g., first login or account switch)
    autoClaimedRef.current = false
    autoClaimCooldownRef.current = 0
  }, [sessionPubkey])

  const eligible = useMemo(() => {
    if (!enabled) return false
    if (alreadyPurchased) return false
    if (!priceSats || priceSats <= 0) return false
    return viewerZapTotalSats >= priceSats
  }, [alreadyPurchased, enabled, priceSats, viewerZapTotalSats])

  const normalizedEventId = eventId?.toLowerCase()
  const normalizedEventPubkey = eventPubkey?.toLowerCase()
  const normalizedEventIdentifier = eventIdentifier?.toLowerCase()
  const eventATag =
    eventKind && normalizedEventPubkey && normalizedEventIdentifier
      ? `${eventKind}:${normalizedEventPubkey}:${normalizedEventIdentifier}`
      : null

  const viewerReceipts = useMemo(() => {
    if (!zapReceipts || !sessionPubkey) return []
    return zapReceipts.filter((zap) => {
      const payerKeys = zap.payerPubkeys ?? (zap.senderPubkey ? [zap.senderPubkey] : [])
      const matchesPayer = payerKeys.some((k) => k?.toLowerCase() === sessionPubkey)
      if (!matchesPayer) return false
      if ((normalizedEventId || eventATag) && zap.event?.tags) {
        const eTag = zap.event.tags.find((t) => t[0] === "e")?.[1]?.toLowerCase()
        const aTag = zap.event.tags.find((t) => t[0] === "a")?.[1]?.toLowerCase()
        const matchesEvent =
          (normalizedEventId && eTag === normalizedEventId) ||
          (eventATag && typeof aTag === "string" && aTag === eventATag)
        if (!matchesEvent) return false
      }
      return true
    })
  }, [zapReceipts, sessionPubkey, normalizedEventId, eventATag])

  const claimPurchase = useCallback(async (args?: ClaimArgs) => {
    if (!isAuthed) {
      setError("Sign in to claim your purchase.")
      return null
    }

    if (!resourceId && !courseId) {
      setError("Missing resourceId or courseId for purchase claim.")
      return null
    }

    try {
      setStatus("pending")
      setError(null)

      const amountPaid = Math.max(
        args?.amountPaidOverride ?? viewerZapTotalSats,
        priceSats
      )

      const fallbackReceipt = viewerReceipts[0]
      const receiptIds = args?.zapReceiptIds ?? viewerReceipts.map((r) => r.id).filter(Boolean)
      const receiptEvents = args?.zapReceiptEvents
        ?? viewerReceipts.map((r) => r.event).filter(Boolean)
      const hasSingleReceipt = (receiptIds?.length ?? 0) <= 1

      // Avoid sending an invoice hint when multiple zap receipts are involved; each zap has its own invoice.
      const invoiceHint = hasSingleReceipt
        ? (args?.invoice ?? fallbackReceipt?.bolt11)
        : undefined

      const payload = {
        resourceId,
        courseId,
        amountPaid,
        paymentType: args?.paymentType ?? "zap",
        zapReceiptId: args?.zapReceiptId ?? (hasSingleReceipt ? fallbackReceipt?.id : undefined),
        zapReceiptIds: receiptIds,
        invoice: invoiceHint,
        paymentPreimage: args?.paymentPreimage,
        zapTotalSats: viewerZapTotalSats,
        nostrPrice: priceSats,
        zapReceiptJson: receiptEvents && receiptEvents.length > 0 ? receiptEvents : undefined,
        zapRequestJson: args?.zapRequestJson,
        relayHints: args?.relayHints,
        allowPastZaps: args?.allowPastZaps,
      }

      const res = await fetch("/api/purchases/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || "Purchase claim failed")
      }

      const body = await res.json()
      const claimed: Purchase | undefined = body?.data?.purchase
      if (claimed) {
        setPurchase(claimed)
        setStatus("success")
        return claimed
      }

      throw new Error("Purchase claim response missing purchase data")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to claim purchase"
      setStatus("error")
      setError(message)
      return null
    }
  }, [courseId, isAuthed, priceSats, resourceId, viewerZapTotalSats, viewerReceipts])

  useEffect(() => {
    if (!autoClaim) return
    if (!eligible) return
    if (!isAuthed) return
    if (alreadyPurchased) return
    if (autoClaimedRef.current) return

    const now = Date.now()
    if (now < autoClaimCooldownRef.current) return

    ;(async () => {
      const claimed = await claimPurchase()
      if (claimed) {
        autoClaimedRef.current = true
        autoClaimFailCountRef.current = 0
        onSuccessRef.current?.(claimed)
        return
      }

      // Treat null as a failure so we back off and emit an error callback.
      autoClaimFailCountRef.current += 1
      onErrorRef.current?.("Auto-claim could not verify a purchase yet.")
      if (autoClaimFailCountRef.current % 3 === 0) {
        console.warn("usePurchaseEligibility: auto-claim repeated failures", {
          failures: autoClaimFailCountRef.current,
          resourceId,
          courseId,
          priceSats,
          viewerZapTotalSats
        })
      }
      autoClaimCooldownRef.current = Date.now() + 5000
    })()
  }, [alreadyPurchased, autoClaim, claimPurchase, eligible, isAuthed, courseId, priceSats, resourceId, viewerZapTotalSats])

  const resetError = useCallback(() => setError(null), [])

  return {
    eligible,
    status,
    purchase,
    error,
    claimPurchase,
    resetError,
  }
}
