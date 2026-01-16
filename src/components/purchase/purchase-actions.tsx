"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PurchaseDialog } from "@/components/purchase/purchase-dialog"
import { Zap } from "lucide-react"
import { getPurchaseIcon } from "@/lib/payments-config"

// Icon lookup at module level (not during render) to avoid React rules violation
const ShieldCheckIcon = getPurchaseIcon("shieldCheck")

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
        <div className="flex items-center gap-2 rounded-md border border-success/20 bg-success/10 px-3 py-2">
          <ShieldCheckIcon className="h-4 w-4 text-success" />
          <span className="text-sm font-medium text-success-foreground">
            You have access to this content
          </span>
        </div>
      ) : (
        <>
          {viewerZapTotalSats > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary">
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
