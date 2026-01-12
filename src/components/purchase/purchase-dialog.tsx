"use client"

import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import QRCode from "react-qr-code"
import { 
  Check,
  ChevronDown, 
  ChevronUp, 
  Copy, 
  ExternalLink, 
  Loader2, 
  Lock,
  QrCode,
  Unlock,
  Zap 
} from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { getByteLength, truncateToByteLength } from "@/lib/lightning"
import { cn } from "@/lib/utils"
import type { LightningRecipient, ZapSendResult } from "@/types/zap"
import type { ZapInsights, ZapReceiptSummary } from "@/hooks/useInteractions"
import type { Purchase } from "@prisma/client"
import { useZapSender } from "@/hooks/useZapSender"
import { usePurchaseEligibility } from "@/hooks/usePurchaseEligibility"
import { getPaymentsConfig, getPurchaseIcon } from "@/lib/payments-config"
import { copyConfig } from "@/lib/copy"

// Icon lookup at module level (not during render) to avoid React rules violation
const ShieldCheckIcon = getPurchaseIcon("shieldCheck")

const formatTemplate = (template?: string, vars: Record<string, string | number> = {}) =>
  template?.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`
  )

const paymentsConfig = getPaymentsConfig()
const configMinZap = paymentsConfig.purchase?.minZap ?? 500
const envMinZap = Number(process.env.NEXT_PUBLIC_MIN_ZAP_SATS)
const MIN_ZAP = Number.isFinite(envMinZap) && envMinZap > 0 ? envMinZap : configMinZap
const purchaseAutoCloseMs = paymentsConfig.purchase?.autoCloseMs ?? 1200
const purchaseAutoShowQr = paymentsConfig.purchase?.autoShowQr ?? false
const purchaseProgressBasis = paymentsConfig.purchase?.progressBasis ?? "server"
const purchaseNoteMaxBytes = paymentsConfig.purchase?.noteMaxBytes ?? 280

interface PurchaseDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  priceSats: number
  resourceId?: string
  courseId?: string
  title: string
  eventId?: string
  eventKind?: number
  eventIdentifier?: string
  eventPubkey?: string
  zapTarget?: LightningRecipient
  viewerZapTotalSats: number
  alreadyPurchased?: boolean
  viewerZapReceipts?: ZapReceiptSummary[]
  zapInsights?: ZapInsights
  recentZaps?: ZapReceiptSummary[]
  onPurchaseComplete?: (purchase: Purchase) => void
}

// Shared formatters
function formatSats(value?: number | null): string {
  if (value == null) return "—"
  return value.toLocaleString()
}

function formatShortPubkey(pubkey?: string | null): string {
  if (!pubkey || pubkey.length < 12) return pubkey || "anon"
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`
}

function formatRelativeTime(seconds?: number | null): string {
  if (!seconds) return "—"
  const diffMs = Math.max(0, Date.now() - seconds * 1000)
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d` : new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
  const purchaseCopy = copyConfig.payments?.purchaseDialog

  const [preferAnonymous, setPreferAnonymous] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Zap sender
  const { sendZap, zapState, resetZapState, isZapInFlight, retryWeblnPayment } = useZapSender({
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey,
    zapTarget,
    preferAnonymousZap: preferAnonymous,
  })

  // Purchase eligibility
  const {
    eligible, 
    status: purchaseStatus, 
    purchase, 
    claimPurchase, 
    error: purchaseError 
  } = usePurchaseEligibility({
    resourceId,
    courseId,
    priceSats,
    viewerZapTotalSats,
    alreadyPurchased,
    autoClaim: true,
    zapReceipts: viewerZapReceipts ?? recentZaps,
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey,
    onAutoClaimSuccess: (claimed) => {
      const snapshot = claimed.priceAtPurchase
      const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
      const required = Math.min(snapshotValid ? snapshot : priceSats, priceSats)
      const unlocked = (claimed.amountPaid ?? 0) >= (required ?? 0)
      const autoClaimCopy = purchaseCopy?.autoClaim
      toast({
        title: unlocked
          ? autoClaimCopy?.unlockedTitle ?? "Unlocked! 🎉"
          : autoClaimCopy?.recordedTitle ?? "Payment recorded",
        description: unlocked
          ? autoClaimCopy?.unlockedDescription ?? "Your zaps unlocked this content"
          : formatTemplate(autoClaimCopy?.recordedDescription, { amount: claimed.amountPaid.toLocaleString() }) ?? `${claimed.amountPaid.toLocaleString()} sats recorded`,
      })
      onPurchaseComplete?.(claimed)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => onOpenChange(false), purchaseAutoCloseMs)
    },
    onAutoClaimError: (error) => {
      toast({
        title: purchaseCopy?.autoClaim?.claimFailedTitle ?? "Claim failed",
        description: error,
        variant: "destructive"
      })
    }
  })

  // Add this new useEffect for cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  // Form state (authoritative balance from server when available)
  const paidSatsServer = purchase?.amountPaid ?? 0
  const requiredPrice = (() => {
    const snapshot = purchase?.priceAtPurchase
    const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
    return Math.min(snapshotValid ? snapshot : priceSats, priceSats)
  })()
  // If server already shows full payment, trust it. Otherwise allow viewer zap totals to cover the gap.
  const paidBasis = (purchase && paidSatsServer >= requiredPrice)
    ? paidSatsServer
    : Math.max(paidSatsServer, viewerZapTotalSats)
  const remaining = Math.max(0, requiredPrice - paidBasis)
  const baseAmount = remaining > 0 ? remaining : requiredPrice
  const defaultAmount = Math.max(baseAmount, MIN_ZAP)
  const [amount, setAmount] = useState(defaultAmount.toString())
  const [note, setNote] = useState("")

  const resolvedAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0
  const isValid = resolvedAmount >= MIN_ZAP

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setAmount(defaultAmount.toString())
      setNote("")
      setShowQr(false)
      resetZapState()
    }
  }, [isOpen, defaultAmount, resetZapState])

  useEffect(() => {
    if (zapState.invoice && purchaseAutoShowQr) setShowQr(true)
  }, [zapState.invoice])

  // Handlers
  const handlePurchase = useCallback(async () => {
    if (!isAuthed) {
      toast({ title: purchaseCopy?.validation?.signInRequired ?? "Sign in required", variant: "destructive" })
      return
    }
    if (!isValid) {
      const minRequired = Math.max(remaining, MIN_ZAP)
      toast({
        title: purchaseCopy?.validation?.invalidAmountTitle ?? "Invalid amount",
        description: formatTemplate(purchaseCopy?.validation?.invalidAmountDescription, { min: minRequired }) ?? `Minimum ${minRequired} sats`,
        variant: "destructive"
      })
      return
    }

    try {
      const result = await sendZap({ amountSats: resolvedAmount, note, preferAnonymous })
      toast({
        title: result.paid
          ? purchaseCopy?.send?.paidTitle ?? "Payment sent"
          : purchaseCopy?.send?.invoiceReadyTitle ?? "Invoice ready",
        description: result.paid
          ? purchaseCopy?.send?.paidDescription ?? "Recording purchase..."
          : purchaseCopy?.send?.invoiceReadyDescription ?? "Pay to unlock"
      })

      if (result.paid) {
        const claimed = await claimPurchase({
          invoice: result.invoice,
          amountPaidOverride: resolvedAmount,
          paymentType: "zap",
          paymentPreimage: result.paymentPreimage,
          zapRequestJson: zapState.zapRequest
        })
        if (claimed) {
          const snapshot = claimed.priceAtPurchase
          const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
          const required = Math.min(snapshotValid ? snapshot : priceSats, priceSats)
          const unlocked = (claimed.amountPaid ?? 0) >= (required ?? 0)
          toast({
            title: unlocked
              ? purchaseCopy?.send?.unlockedTitle ?? "Unlocked!"
              : purchaseCopy?.send?.recordedTitle ?? "Recorded",
            description: unlocked
              ? purchaseCopy?.send?.unlockedDescription ?? "Enjoy!"
              : formatTemplate(purchaseCopy?.send?.recordedDescription, { amount: claimed.amountPaid?.toLocaleString() ?? "" }) ?? `${claimed.amountPaid} sats saved`
          })
          onPurchaseComplete?.(claimed)
        } else {
          toast({
            title: purchaseCopy?.send?.waitingTitle ?? "Waiting for receipt",
            description: purchaseCopy?.send?.waitingDescription ?? "Will unlock when confirmed"
          })
        }
      }
    } catch (error) {
      toast({
        title: purchaseCopy?.send?.failedTitle ?? "Failed",
        description: formatTemplate(purchaseCopy?.send?.failedDescription, { error: error instanceof Error ? error.message : "Try again" }) ?? (error instanceof Error ? error.message : "Try again"),
        variant: "destructive"
      })
    }
  }, [isAuthed, isValid, remaining, sendZap, resolvedAmount, note, preferAnonymous, claimPurchase, zapState.zapRequest, priceSats, onPurchaseComplete, toast, purchaseCopy])

  const handleClaimExisting = useCallback(async () => {
    if (!isAuthed) {
      toast({ title: purchaseCopy?.send?.claimSignInTitle ?? "Sign in first", variant: "destructive" })
      return
    }
    const claimed = await claimPurchase()
    if (claimed) {
      toast({
        title: purchaseCopy?.send?.claimSuccessTitle ?? "Unlocked!",
        description: purchaseCopy?.send?.claimSuccessDescription ?? "Past zaps verified"
      })
      onPurchaseComplete?.(claimed)
    } else {
      toast({ title: purchaseCopy?.send?.claimNoneTitle ?? "No receipts found", variant: "destructive" })
    }
  }, [claimPurchase, isAuthed, onPurchaseComplete, toast, purchaseCopy])

  const handleCopy = useCallback(async () => {
    if (!zapState.invoice) return
    try {
      await navigator.clipboard.writeText(zapState.invoice)
      toast({ title: purchaseCopy?.send?.copyTitle ?? "Copied!" })
    } catch {
      toast({ title: purchaseCopy?.send?.copyFailedTitle ?? "Copy failed", variant: "destructive" })
    }
  }, [zapState.invoice, toast, purchaseCopy])

  const handleRetry = useCallback(async () => {
    const paid = await retryWeblnPayment()
    if (paid) {
      toast({ title: purchaseCopy?.send?.unlockedTitle ?? "Paid!" })
      const claimed = await claimPurchase({
        invoice: zapState.invoice!,
        amountPaidOverride: resolvedAmount,
        paymentType: "zap",
        paymentPreimage: zapState.paymentPreimage,
        zapRequestJson: zapState.zapRequest
      })
      if (claimed) onPurchaseComplete?.(claimed)
    } else {
      toast({ title: purchaseCopy?.send?.failedTitle ?? "Failed", variant: "destructive" })
    }
  }, [
    retryWeblnPayment,
    claimPurchase,
    zapState.invoice,
    zapState.paymentPreimage,
    zapState.zapRequest,
    resolvedAmount,
    onPurchaseComplete,
    purchaseCopy,
    toast
  ])

  // Derived states
  const progressPaidSats =
    purchaseProgressBasis === "serverPlusViewer"
      ? Math.max(paidSatsServer, viewerZapTotalSats)
      : paidSatsServer
  const paidSats = paidSatsServer
  const isOwned = alreadyPurchased || paidSats >= priceSats
  const progress = Math.min(100, Math.round((progressPaidSats / priceSats) * 100))
  // Allow manual claim once viewer zaps reach price, even if server purchase is still partial.
  const canClaimFree = eligible && isAuthed && !isOwned && viewerZapTotalSats >= priceSats
  const isProcessing = isZapInFlight || purchaseStatus === "pending"
  const hasStats = Boolean(zapInsights && recentZaps)

  const zapCommentLimit = zapState.metadata?.commentAllowed ?? purchaseNoteMaxBytes
  const bytesLeft = Math.max(0, zapCommentLimit - getByteLength(note))

  // Status message
  const statusMsg = useMemo(() => {
    if (zapState.error) return zapState.error
    if (purchaseError) return purchaseError
    if (zapState.status === "resolving") return "Resolving…"
    if (zapState.status === "signing") return "Signing…"
    if (zapState.status === "requesting-invoice") return "Getting invoice…"
    if (zapState.status === "paying") return "Paying…"
    if (purchaseStatus === "pending") return "Verifying…"
    return ""
  }, [zapState.status, zapState.error, purchaseStatus, purchaseError])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-lg", hasStats && "lg:max-w-3xl")}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isOwned ? <Unlock className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5" />}
            {isOwned ? "Content Unlocked" : "Unlock Content"}
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{title}</DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-4", hasStats && "lg:grid-cols-[1fr_220px]")}>
          {/* Main content */}
          <div className="space-y-4">
            {/* Status bar */}
            {statusMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {statusMsg}
              </div>
            )}

            {/* Already owned */}
            {isOwned ? (
              <div className="flex flex-col items-center justify-center rounded-xl bg-primary/5 border border-primary/20 p-8 text-center">
                <div className="rounded-full bg-primary/10 p-3 mb-3">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">You own this</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Paid {formatSats(paidSats)} sats
                </p>
                <Button className="mt-4" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {formatSats(progressPaidSats)} / {formatSats(priceSats)} sats
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {remaining > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatSats(remaining)} sats remaining to unlock
                    </p>
                  )}
                </div>

                {/* Amount input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="amount" className="text-sm">Amount</Label>
                    <span className="text-xs text-muted-foreground">
                      Price: {formatSats(priceSats)} sats
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isProcessing || Boolean(zapState.invoice)}
                      className="text-lg font-medium"
                      inputMode="numeric"
                    />
                    {remaining > 0 && resolvedAmount !== remaining && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(remaining.toString())}
                        disabled={isProcessing || Boolean(zapState.invoice)}
                      >
                        Exact
                      </Button>
                    )}
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="note" className="text-sm">Note (optional)</Label>
                    <span className="text-xs text-muted-foreground">{bytesLeft} left</span>
                  </div>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(truncateToByteLength(e.target.value, zapCommentLimit))}
                    placeholder="Add a message…"
                    disabled={isProcessing || Boolean(zapState.invoice)}
                    className="h-16 resize-none text-sm"
                  />
                </div>

                {/* Privacy toggle */}
                {isAuthed && (
                  <label className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={preferAnonymous}
                      onChange={(e) => setPreferAnonymous(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                    <span>Private zap (anonymous signature)</span>
                  </label>
                )}

                {/* Invoice section */}
                {zapState.invoice ? (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Invoice</span>
                      {zapState.paid && <Badge className="text-xs">Paid</Badge>}
                    </div>

                    {showQr && (
                      <div className="flex justify-center rounded-md bg-white p-3">
                        <QRCode value={zapState.invoice} size={160} />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={handleCopy}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`lightning:${zapState.invoice}`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Wallet
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowQr(!showQr)}>
                        <QrCode className="h-3.5 w-3.5 mr-1.5" /> {showQr ? "Hide" : "QR"}
                      </Button>
                      {!zapState.paid && (
                        <Button size="sm" variant="ghost" onClick={handleRetry} disabled={isProcessing}>
                          Retry
                        </Button>
                      )}
                    </div>

                    {/* Manual fallback so users can always copy the invoice */}
                    <div className="rounded-md border border-dashed border-border/70 bg-background/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                        BOLT11 invoice
                      </p>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-xs font-mono">
                        {zapState.invoice}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {canClaimFree && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={handleClaimExisting}
                        disabled={isProcessing}
                      >
                        <Unlock className="h-4 w-4 mr-2" />
                        Unlock with past zaps
                      </Button>
                    )}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handlePurchase}
                      disabled={isProcessing || !isValid}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Pay {formatSats(resolvedAmount)} sats
                        </>
                      )}
                    </Button>
                    {!isAuthed && (
                      <p className="text-xs text-center text-muted-foreground">
                        Sign in to save your purchase
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stats sidebar */}
          {hasStats && zapInsights && recentZaps && (
            <aside className="space-y-3 lg:border-l lg:pl-4">
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                <StatBox label="Total" value={formatSats(zapInsights.totalSats)} />
                <StatBox label="Supporters" value={formatSats(zapInsights.uniqueSenders)} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Recent supporters
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {recentZaps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Be the first!</p>
                  ) : (
                    recentZaps.slice(0, 10).map((zap) => (
                      <ZapRow key={zap.id} zap={zap} />
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function ZapRow({ zap }: { zap: ZapReceiptSummary }) {
  const [expanded, setExpanded] = useState(false)
  const pubkey = zap.payerPubkeys?.[0] || zap.senderPubkey || ""

  return (
    <div className="rounded border bg-card/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-primary">{formatSats(zap.amountSats)}</span>
          <span className="text-[10px] text-muted-foreground truncate">
            {pubkey ? formatShortPubkey(pubkey) : "anon"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(zap.createdAt)}</span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t px-2 py-1.5">
          {zap.note && <p className="text-xs text-muted-foreground mb-1">{zap.note}</p>}
          <div className="text-[9px] font-mono text-muted-foreground/70 space-y-0.5">
            {zap.id && <p>Receipt: {zap.id.slice(0, 10)}…</p>}
            <p>Amount: {formatSats(zap.amountSats)} sats</p>
            {zap.senderPubkey && <p>From: {formatShortPubkey(zap.senderPubkey)}</p>}
            {zap.receiverPubkey && <p>To: {formatShortPubkey(zap.receiverPubkey)}</p>}
            {zap.createdAt && <p>Time: {new Date(zap.createdAt * 1000).toLocaleString()}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
