"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import QRCode from "react-qr-code"
import { ShieldCheck, Loader2, Copy, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import { useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Dialog,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { getByteLength, truncateToByteLength } from "@/lib/lightning"
import type { LightningRecipient, ZapSendResult } from "@/types/zap"
import type { ZapInsights, ZapReceiptSummary } from "@/hooks/useInteractions"
import type { Purchase } from "@prisma/client"
import { useZapSender } from "@/hooks/useZapSender"
import { usePurchaseEligibility } from "@/hooks/usePurchaseEligibility"
import { cn } from "@/lib/utils"
import { encodePublicKey } from "snstr"

const MIN_CUSTOM_ZAP = 1

interface PurchaseDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  
  // Purchase details
  priceSats: number
  resourceId?: string
  courseId?: string
  title: string
  
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
  
  // Optional stats for right column
  zapInsights?: ZapInsights
  recentZaps?: ZapReceiptSummary[]
  onPurchaseComplete?: (purchase: Purchase) => void
}

function formatCondensedNpub(pubkey: string): string {
  try {
    const npub = encodePublicKey(pubkey)
    return `${npub.slice(0, 10)}...${npub.slice(-5)}`
  } catch {
    return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`
  }
}

function ZapItem({ zap }: { zap: ZapReceiptSummary }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-md overflow-hidden transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-start text-sm p-3 text-left"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs">{zap.amountSats?.toLocaleString()} sats</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {zap.senderPubkey ? formatCondensedNpub(zap.senderPubkey) : 'Anonymous'}
            </span>
          </div>
          {zap.note ? (
            <p className="text-xs text-muted-foreground line-clamp-1">{zap.note}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No note</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {zap.createdAt ? new Date(zap.createdAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
          </span>
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {expanded && (
        <div className="px-3 pb-3 pt-0 animate-in slide-in-from-top-2 duration-200">
          <div className="rounded bg-muted p-2 overflow-x-auto">
            <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {zap.event ? JSON.stringify(zap.event, null, 2) : JSON.stringify(zap, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export function PurchaseDialog({
  isOpen,
  onOpenChange,
  priceSats,
  resourceId,
  courseId,
  title,
  eventId,
  eventKind,
  eventIdentifier,
  eventPubkey,
  zapTarget,
  viewerZapTotalSats,
  alreadyPurchased = false,
  zapInsights,
  recentZaps,
  viewerZapReceipts,
  onPurchaseComplete,
}: PurchaseDialogProps) {
  const { status: sessionStatus } = useSession()
  const { toast } = useToast()
  const isAuthed = sessionStatus === "authenticated"

  // Zap Sender State
  const { sendZap, zapState, resetZapState, isZapInFlight, retryWeblnPayment } = useZapSender({
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey,
    zapTarget,
  })

  // Purchase Eligibility State
  const { eligible, status: purchaseStatus, purchase, claimPurchase, error: purchaseError } = usePurchaseEligibility({
    resourceId,
    courseId,
    priceSats,
    viewerZapTotalSats,
    alreadyPurchased,
    autoClaim: true, // Auto-claim if eligible
    zapReceipts: viewerZapReceipts ?? recentZaps,
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey,
    onAutoClaimSuccess: (claimed) => {
      const unlocked = (claimed.amountPaid ?? 0) >= priceSats
      toast({
        title: unlocked ? "Content unlocked!" : "Payment recorded",
        description: unlocked
          ? `Your zaps (${claimed.amountPaid.toLocaleString()} sats) unlocked this content.`
          : `We recorded ${claimed.amountPaid.toLocaleString()} sats. Keep zapping to unlock.`,
      })
      if (onPurchaseComplete) {
        onPurchaseComplete(claimed)
      }
      // Close dialog after a brief delay to let user see the success message
      setTimeout(() => {
        onOpenChange(false)
      }, 1500)
    },
    onAutoClaimError: (error) => {
      toast({
        title: "Auto-claim failed",
        description: error,
        variant: "destructive"
      })
    }
  })

  // Local Form State
  // Default amount is the price. If user has paid some, maybe price - paid? 
  // But simplest is just default to price.
  const remainingPrice = Math.max(0, priceSats - viewerZapTotalSats)
  const defaultAmount = remainingPrice > 0 ? remainingPrice : priceSats
  
  const [amount, setAmount] = useState<string>(defaultAmount.toString())
  const [note, setNote] = useState("")
  const [showInvoiceQr, setShowInvoiceQr] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAmount(defaultAmount.toString())
      setNote("")
      setShowInvoiceQr(false)
      resetZapState()
    }
  }, [isOpen, defaultAmount, resetZapState])

  // Auto-show QR when invoice arrives
  useEffect(() => {
    setShowInvoiceQr(Boolean(zapState.invoice))
  }, [zapState.invoice])

  // Handle Purchase/Zap
  const resolvedAmount = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0
  // Allow incremental zaps; only enforce minimum zap size.
  const isValidAmount = resolvedAmount >= MIN_CUSTOM_ZAP

  const handlePurchase = useCallback(async () => {
    if (!isAuthed) {
      toast({
        title: "Sign in required",
        description: "Sign in to record your purchase. You can still tip via the Zap dialog when logged out.",
        variant: "destructive"
      })
      return
    }

    if (!isValidAmount) {
       toast({
        title: "Invalid amount",
        description: `Please enter at least ${Math.max(MIN_CUSTOM_ZAP, remainingPrice).toLocaleString()} sats.`,
        variant: "destructive"
      })
      return
    }

    try {
      const result = await sendZap({ amountSats: resolvedAmount, note })
      
      toast({
        title: result.paid ? "Payment successful" : "Invoice ready",
        description: result.paid
          ? "We’re recording your purchase..."
          : "Pay the invoice to unlock this content.",
        variant: result.paid ? "default" : "default"
      })

      if (result.paid) {
        const claimed = await claimPurchase({
          invoice: result.invoice,
          amountPaidOverride: resolvedAmount,
          paymentType: "zap",
          paymentPreimage: result.paymentPreimage,
        })

        if (!claimed) {
          toast({
            title: "Waiting for receipt",
            description: "We’ll unlock automatically once your zap receipt arrives.",
          })
        } else {
          const unlocked = (claimed.amountPaid ?? 0) >= priceSats
          toast({
            title: unlocked ? "Content unlocked!" : "Payment recorded",
            description: unlocked
              ? "Purchase saved. Enjoy your content!"
              : `Recorded ${claimed.amountPaid.toLocaleString()} sats. Keep zapping to unlock.`,
          })
          if (onPurchaseComplete) {
            onPurchaseComplete(claimed)
          }
        }
        // Don't reset state immediately so user sees success message
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to send payment."
      toast({ title: "Payment failed", description, variant: "destructive" })
    }
  }, [isAuthed, isValidAmount, remainingPrice, sendZap, resolvedAmount, note, toast, claimPurchase, onPurchaseComplete, priceSats])

  const handleClaimWithoutZap = useCallback(async () => {
    try {
      if (!isAuthed) {
        toast({
          title: "Sign in required",
          description: "Sign in so we can attach your past zaps to this purchase.",
          variant: "destructive"
        })
        return
      }

      const claimed = await claimPurchase()
      if (claimed) {
        toast({
          title: "Purchase recorded",
          description: "You’ve already paid enough via zaps — unlocking now."
        })
        if (onPurchaseComplete) {
          onPurchaseComplete(claimed)
        }
      } else {
        toast({
          title: "Claim not recorded",
          description: "We could not verify a matching zap receipt yet. Try again after your zap is confirmed.",
          variant: "destructive"
        })
      }
    } catch (err) {
      const desc = err instanceof Error ? err.message : "Could not record purchase"
      toast({ title: "Claim failed", description: desc, variant: "destructive" })
    }
  }, [claimPurchase, toast, isAuthed, onPurchaseComplete])

  const handleCopyInvoice = useCallback(async () => {
    if (!zapState.invoice) return
    try {
      await navigator.clipboard.writeText(zapState.invoice)
      toast({ title: "Invoice copied", description: "Paste into any Lightning wallet." })
    } catch (error) {
      toast({
        title: "Clipboard error",
        description: "Could not copy invoice.",
        variant: "destructive"
      })
    }
  }, [zapState.invoice, toast])

  const handleRetryWebln = useCallback(async () => {
    const paid = await retryWeblnPayment()
    if (paid) {
      toast({ title: "Paid via WebLN", description: "Recording purchase..." })
      // The usePurchaseEligibility hook should pick up the zap if we claimed? 
      // Actually retryWeblnPayment just pays. We need to claim.
      // But useZapSender doesn't return the result from retryWeblnPayment in a way that gives us the invoice easily 
      // unless we use zapState.invoice.
      
      // If paid, we should try to claim.
      const claimed = await claimPurchase({
        invoice: zapState.invoice!,
        amountPaidOverride: resolvedAmount, // Best guess
        paymentType: "zap",
        paymentPreimage: zapState.paymentPreimage
      })

      if (!claimed) {
        toast({
          title: "Waiting for receipt",
          description: "We’ll unlock automatically once your zap receipt arrives."
        })
      } else {
        const unlocked = (claimed.amountPaid ?? 0) >= priceSats
        toast({
          title: unlocked ? "Content unlocked!" : "Payment recorded",
          description: unlocked
            ? "Purchase saved. Enjoy your content!"
            : `Recorded ${claimed.amountPaid.toLocaleString()} sats. Keep zapping to unlock.`,
        })
        if (onPurchaseComplete) {
          onPurchaseComplete(claimed)
        }
      }
    } else {
      toast({ title: "WebLN failed", description: "Please pay manually.", variant: "destructive" })
    }
  }, [retryWeblnPayment, toast, claimPurchase, zapState.invoice, zapState.paymentPreimage, resolvedAmount, onPurchaseComplete, priceSats])

  // Derived UI States
  const showAlreadyOwned = alreadyPurchased || Boolean(purchase)
  const canClaimFree = eligible && isAuthed && !showAlreadyOwned && remainingPrice <= 0
  const isProcessing = isZapInFlight || purchaseStatus === "pending"
  
  const zapCommentLimitBytes = zapState.metadata?.commentAllowed ?? 280
  const zapNoteBytesRemaining = Math.max(0, zapCommentLimitBytes - getByteLength(note))

  const zapTargetName = zapTarget?.name || "this creator"
  const lightningAddressDisplay = 
    zapTarget?.lightningAddress || 
    zapTarget?.lnurl || 
    zapState.lnurlDetails?.identifier || 
    "No lightning address"

  // Status Message
  const statusMessage = useMemo(() => {
    if (zapState.error) return zapState.error
    if (purchaseError) return purchaseError
    if (zapState.status === "resolving") return "Resolving lightning address..."
    if (zapState.status === "signing") return "Creating zap request..."
    if (zapState.status === "requesting-invoice") return "Requesting invoice..."
    if (zapState.status === "paying") return "Paying via WebLN..."
    if (purchaseStatus === "pending") return "Verifying purchase..."
    return ""
  }, [zapState.status, zapState.error, purchaseStatus, purchaseError])

  // Show auto-claim status when eligible and claiming
  const showAutoClaimStatus = eligible && purchaseStatus === "pending" && !showAlreadyOwned

  // Layout logic: Single column if no stats, Two column if stats available
  const hasStats = Boolean(zapInsights && recentZaps)

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[85vh] overflow-y-auto",
        hasStats ? "max-w-3xl sm:max-w-4xl lg:max-w-5xl" : "max-w-md sm:max-w-lg"
      )}>
        <DialogHeader>
          <DialogTitle>Unlock content</DialogTitle>
          <DialogDescription>
            Support {zapTargetName} with a zap to unlock <strong>{title}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className={cn("flex flex-col gap-6", hasStats && "lg:grid lg:grid-cols-[minmax(0,1fr)_320px]")}>
          {/* LEFT COLUMN: Action */}
          <div className="space-y-4">
            {/* Auto-claim Status Banner */}
            {showAutoClaimStatus && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-blue-800 dark:text-blue-200">
                  Claiming your purchase...
                </span>
              </div>
            )}

            {/* Status Banner */}
            {statusMessage && !showAutoClaimStatus && (
              <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {statusMessage}
              </div>
            )}
            
            {showAlreadyOwned ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-success/20 bg-success/10 p-8 text-center">
                <ShieldCheck className="h-12 w-12 text-success mb-2" />
                <h3 className="text-lg font-semibold text-success-foreground">Content Unlocked</h3>
                <p className="text-sm text-success-foreground/80">You have full access to this content.</p>
                <Button className="mt-4" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            ) : (
              <>
                {/* Amount & Note Inputs */}
                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="amount">Amount (sats)</Label>
                    <span className="text-xs text-muted-foreground">Price: {priceSats.toLocaleString()} sats</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isProcessing || Boolean(zapState.invoice)}
                      className="text-lg font-medium"
                    />
                  </div>
                  
                  {remainingPrice > 0 && resolvedAmount < remainingPrice && (
                    <p className="text-xs text-destructive">
                      Minimum {remainingPrice.toLocaleString()} sats required to unlock.
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="note">Note (optional)</Label>
                    <Textarea
                      id="note"
                      placeholder="Add a message..."
                      value={note}
                      onChange={(e) => setNote(truncateToByteLength(e.target.value, zapCommentLimitBytes))}
                      disabled={isProcessing || Boolean(zapState.invoice)}
                      className="resize-none h-20"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {zapNoteBytesRemaining} bytes left
                    </p>
                  </div>
                </div>

                {/* Invoice Display */}
                {zapState.invoice ? (
                   <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Invoice Ready</Label>
                      {zapState.paid && <span className="text-xs text-success font-medium">Paid</span>}
                    </div>
                    
                    {showInvoiceQr && (
                      <div className="flex justify-center p-4 bg-white rounded-md">
                        <QRCode value={zapState.invoice} size={192} />
                      </div>
                    )}

                    <div className="rounded-md bg-muted p-3">
                      <p className="break-all text-xs font-mono text-muted-foreground line-clamp-3">
                        {zapState.invoice}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={handleCopyInvoice}>
                        <Copy className="h-4 w-4 mr-2" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`lightning:${zapState.invoice}`}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Wallet
                        </a>
                      </Button>
                       {!zapState.paid && (
                        <Button variant="ghost" size="sm" onClick={handleRetryWebln} disabled={isProcessing}>
                          Retry WebLN
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {canClaimFree && (
                       <Button 
                        variant="secondary" 
                        className="w-full" 
                        onClick={handleClaimWithoutZap}
                        disabled={isProcessing}
                      >
                        Unlock with past zaps
                      </Button>
                    )}
                    <Button 
                      className="w-full" 
                      size="lg" 
                      onClick={handlePurchase}
                      disabled={isProcessing || !isValidAmount}
                    >
                      {isProcessing ? "Processing..." : `Purchase for ${resolvedAmount.toLocaleString()} sats`}
                    </Button>
                    {!isAuthed && (
                       <p className="text-xs text-center text-muted-foreground mt-2">
                         Sign in first so we can unlock this purchase for your account.
                       </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Stats (Optional) */}
          {hasStats && zapInsights && recentZaps && (
            <aside className="space-y-4 border-t lg:border-t-0 lg:border-l lg:pl-6 pt-4 lg:pt-0 lg:flex lg:flex-col lg:h-full">
               <div className="grid grid-cols-2 gap-3 text-sm mb-4 shrink-0">
                <div className="rounded-lg border bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground">Total sats</p>
                  <p className="text-base font-semibold">{zapInsights.totalSats.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground">Supporters</p>
                  <p className="text-base font-semibold">{zapInsights.uniqueSenders.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3 lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
                 <h4 className="text-sm font-medium shrink-0">Recent supporters</h4>
                 <div className="space-y-2 max-h-64 lg:max-h-none lg:flex-1 overflow-y-auto pr-1 lg:min-h-0">
                    {recentZaps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Be the first to support this content!</p>
                    ) : (
                      recentZaps.slice(0, 10).map((zap) => (
                        <ZapItem key={zap.id} zap={zap} />
                      ))
                    )}
                 </div>
              </div>
            </aside>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
