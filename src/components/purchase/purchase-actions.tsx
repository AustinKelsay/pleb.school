"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PurchaseDialog } from "@/components/purchase/purchase-dialog"
import { ShieldCheck, Zap } from "lucide-react"
import type { LightningRecipient } from "@/types/zap"
import type { ZapReceiptSummary } from "@/hooks/useInteractions"

interface PurchaseActionsProps {
  priceSats: number
  courseId?: string
  resourceId?: string
  title?: string

  // Nostr event details for zap
  eventId?: string
  eventKind?: number
  eventIdentifier?: string
  eventPubkey?: string
  zapTarget?: LightningRecipient

  // Viewer state
  viewerZapTotalSats: number
  alreadyPurchased?: boolean
  viewerZapReceipts?: ZapReceiptSummary[]

  // Optional stats for dialog
  zapInsights?: any
  recentZaps?: any[]
  onPurchaseComplete?: () => void
}

export function PurchaseActions({
  priceSats,
  courseId,
  resourceId,
  title,
  eventId,
  eventKind,
  eventIdentifier,
  eventPubkey,
  zapTarget,
  viewerZapTotalSats,
  alreadyPurchased = false,
  viewerZapReceipts,
  zapInsights,
  recentZaps,
  onPurchaseComplete,
}: PurchaseActionsProps) {
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)

  const remainingPrice = Math.max(0, priceSats - viewerZapTotalSats)
  const isEligible = viewerZapTotalSats >= priceSats
  const hasAccess = alreadyPurchased || isEligible

  return (
    <div className="flex flex-col gap-3">
      {hasAccess ? (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
          <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            You have access to this content
          </span>
        </div>
      ) : (
        <>
          {viewerZapTotalSats > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <Zap className="h-4 w-4 text-blue-700 dark:text-blue-300" />
              <span className="text-sm text-blue-800 dark:text-blue-200">
                You&apos;ve sent {viewerZapTotalSats.toLocaleString()} sats • {remainingPrice.toLocaleString()} more needed
              </span>
            </div>
          )}
          <Button
            size="lg"
            onClick={() => setShowPurchaseDialog(true)}
            className="w-full sm:w-auto"
          >
            Purchase for {priceSats.toLocaleString()} sats
          </Button>
        </>
      )}

      <PurchaseDialog
        isOpen={showPurchaseDialog}
        onOpenChange={setShowPurchaseDialog}
        title={title || "Content"}
        priceSats={priceSats}
        courseId={courseId}
        resourceId={resourceId}
        eventId={eventId}
        eventKind={eventKind}
        eventIdentifier={eventIdentifier}
        eventPubkey={eventPubkey}
        zapTarget={zapTarget}
        viewerZapTotalSats={viewerZapTotalSats}
        alreadyPurchased={alreadyPurchased}
        viewerZapReceipts={viewerZapReceipts}
        zapInsights={zapInsights}
        recentZaps={recentZaps}
        onPurchaseComplete={onPurchaseComplete}
      />
    </div>
  )
}
