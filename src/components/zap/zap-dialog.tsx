"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  ExternalLink, 
  Loader2, 
  QrCode,
  Zap 
} from "lucide-react"
import { useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useZapFormState, MIN_CUSTOM_ZAP, QUICK_ZAP_AMOUNTS } from "@/hooks/useZapFormState"
import { getByteLength, truncateToByteLength } from "@/lib/lightning"
import { cn } from "@/lib/utils"
import type { LightningRecipient, ZapSendResult } from "@/types/zap"
import type { ZapInsights, ZapReceiptSummary } from "@/hooks/useInteractions"
import type { ZapState } from "@/hooks/useZapSender"
import { copyConfig } from "@/lib/copy"
import { getPaymentsConfig, getPurchaseIcon } from "@/lib/payments-config"

// Icon lookup at module level (not during render) to avoid React rules violation
const ShieldCheckIcon = getPurchaseIcon("shieldCheck")

const formatTemplate = (template?: string, vars: Record<string, string | number> = {}) =>
  template?.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`
  )

interface ZapDialogProps {
  isOpen: boolean
  zapInsights: ZapInsights
  recentZaps: ZapReceiptSummary[]
  hasZappedWithLightning: boolean
  viewerZapTotalSats: number
  zapTarget?: LightningRecipient
  zapState: ZapState
  sendZap: (args: { amountSats: number; note?: string }) => Promise<ZapSendResult>
  retryWeblnPayment: () => Promise<boolean>
  resetZapState: () => void
  isZapInFlight: boolean
  minZapSats?: number | null
  maxZapSats?: number | null
  preferAnonymousZap: boolean
  onTogglePrivacy?: (value: boolean) => void
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
  if (seconds == null) return "—"
  const diffMs = Math.max(0, Date.now() - seconds * 1000)
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d` : new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function ZapDialog({
  isOpen,
  zapInsights,
  recentZaps,
  hasZappedWithLightning,
  viewerZapTotalSats,
  zapTarget,
  zapState,
  sendZap,
  retryWeblnPayment,
  resetZapState,
  isZapInFlight,
  minZapSats,
  maxZapSats,
  preferAnonymousZap,
  onTogglePrivacy
}: ZapDialogProps) {
  const { status: sessionStatus, data: session } = useSession()
  const {
    selectedZapAmount,
    customZapAmount,
    zapNote,
    hasCustomAmount,
    customAmountInvalid,
    resolvedZapAmount,
    handleSelectQuickAmount,
    handleCustomAmountChange,
    setZapNote,
    resetForm
  } = useZapFormState()
  const { toast } = useToast()
  const [showQr, setShowQr] = useState(false)
  const zapCopy = copyConfig.payments?.zapDialog
  const paymentsConfig = getPaymentsConfig()

  const zapCommentLimit = zapState.metadata?.commentAllowed ?? paymentsConfig.zap.noteMaxBytes
  const bytesRemaining = Math.max(0, zapCommentLimit - getByteLength(zapNote))
  const targetName = zapTarget?.name || "this creator"
  const lightningId = zapTarget?.lightningAddress || zapTarget?.lnurl || zapState.lnurlDetails?.identifier || ""
  const isAuthed = sessionStatus === "authenticated"
  const privacyCfg = paymentsConfig.zap.privacyToggle
  const showPrivacyToggle =
    privacyCfg.enabled &&
    (!privacyCfg.requireAuth || isAuthed) &&
    (!privacyCfg.hideWhenPrivkeyPresent || !session?.user?.privkey)

  const effectiveMinZap = typeof minZapSats === "number" ? minZapSats : MIN_CUSTOM_ZAP
  const belowMin = resolvedZapAmount < effectiveMinZap
  const aboveMax = typeof maxZapSats === "number" && resolvedZapAmount > maxZapSats
  const invalidAmount = customAmountInvalid || resolvedZapAmount < MIN_CUSTOM_ZAP || belowMin || aboveMax
  const ctaDisabled = invalidAmount || isZapInFlight
  const recentZapsLimit = paymentsConfig.zap.recentZapsLimit

  useEffect(() => {
    if (!isOpen) {
      resetForm()
      resetZapState()
      setShowQr(false)
    }
  }, [isOpen, resetForm, resetZapState])

  useEffect(() => {
    if (zapState.invoice && paymentsConfig.zap.autoShowQr) setShowQr(true)
  }, [zapState.invoice, paymentsConfig.zap.autoShowQr])

  const handleSend = useCallback(async () => {
    if (invalidAmount) {
      toast({
        title: zapCopy?.invalidAmountTitle ?? "Invalid amount",
        description: belowMin || aboveMax
          ? formatTemplate(zapCopy?.invalidAmountRange, {
              min: effectiveMinZap?.toLocaleString() ?? 1,
              max: maxZapSats?.toLocaleString() ?? "∞"
            }) ?? `Choose between ${effectiveMinZap?.toLocaleString() ?? 1}–${maxZapSats?.toLocaleString() ?? "∞"} sats`
          : formatTemplate(zapCopy?.invalidAmountMinimum, { min: MIN_CUSTOM_ZAP }) ?? `Minimum ${MIN_CUSTOM_ZAP} sat`,
        variant: "destructive"
      })
      return
    }

    try {
      const result = await sendZap({ amountSats: resolvedZapAmount, note: zapNote })
      toast({
        title: result.paid
          ? zapCopy?.successPaidTitle ?? "Zap sent ⚡"
          : zapCopy?.invoiceReadyTitle ?? "Invoice ready",
        description: result.paid
          ? zapCopy?.successPaidDescription ?? "Thanks for the support!"
          : zapCopy?.invoiceReadyDescription ?? "Pay with your Lightning wallet"
      })
    } catch (error) {
      toast({
        title: zapCopy?.failedTitle ?? "Zap failed",
        description: formatTemplate(zapCopy?.failedDescription, { error: error instanceof Error ? error.message : "Try again" }) ?? (error instanceof Error ? error.message : "Try again"),
        variant: "destructive"
      })
    }
  }, [invalidAmount, belowMin, aboveMax, effectiveMinZap, maxZapSats, resolvedZapAmount, sendZap, zapNote, toast, zapCopy])

  const handleCopy = useCallback(async () => {
    if (!zapState.invoice) return
    try {
      await navigator.clipboard.writeText(zapState.invoice)
      toast({ title: zapCopy?.copiedTitle ?? "Copied!" })
    } catch {
      toast({ title: zapCopy?.copyFailedTitle ?? "Copy failed", variant: "destructive" })
    }
  }, [zapState.invoice, toast, zapCopy])

  const handleRetry = useCallback(async () => {
    const paid = await retryWeblnPayment()
    toast({
      title: paid
        ? zapCopy?.retryPaidTitle ?? "Zap paid!"
        : zapCopy?.retryFailedTitle ?? "WebLN failed",
      description: paid
        ? zapCopy?.retryPaidDescription ?? "Thanks!"
        : zapCopy?.retryFailedDescription ?? "Pay manually below",
      variant: paid ? "default" : "destructive"
    })
  }, [retryWeblnPayment, toast, zapCopy])

  // Status indicator
  const statusConfig: Record<string, { text: string; loading: boolean; error?: boolean }> = {
    resolving: { text: zapCopy?.status?.resolving ?? "Resolving...", loading: true },
    signing: { text: zapCopy?.status?.signing ?? "Signing...", loading: true },
    "requesting-invoice": { text: zapCopy?.status?.requestingInvoice ?? "Getting invoice...", loading: true },
    paying: { text: zapCopy?.status?.paying ?? "Paying...", loading: true },
    "invoice-ready": {
      text: zapState.weblnError
        ? zapCopy?.status?.invoiceReadyWeblnFailed ?? "WebLN failed"
        : zapCopy?.status?.invoiceReady ?? "Ready to pay",
      loading: false
    },
    success: { text: zapCopy?.status?.success ?? "Sent!", loading: false },
    error: { text: zapState.error || zapCopy?.status?.error || "Failed", loading: false, error: true }
  }
  const status = statusConfig[zapState.status]

  return (
    <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Send a zap
        </DialogTitle>
        <DialogDescription>
          Support {targetName} with a Lightning tip
          {!isAuthed && <span className="text-xs opacity-70"> • Sign in to save purchases</span>}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        {/* Main column */}
        <div className="space-y-4">
          {/* Status bar */}
          {status && zapState.status !== "idle" && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              status.error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              {status.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status.text}
            </div>
          )}

          {/* Amount selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Amount</Label>
              <span className="text-sm font-semibold text-primary">{formatSats(resolvedZapAmount)} sats</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {QUICK_ZAP_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleSelectQuickAmount(amt)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                    selectedZapAmount === amt && !hasCustomAmount
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
              <Input
                inputMode="numeric"
                placeholder="Custom"
                value={customZapAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="h-8 w-20 text-sm"
              />
            </div>

            {(minZapSats || maxZapSats) && (
              <p className="text-xs text-muted-foreground">
                Range: {minZapSats?.toLocaleString() ?? 1}–{maxZapSats?.toLocaleString() ?? "∞"} sats
              </p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="zap-note" className="text-sm">Note (optional)</Label>
              <span className="text-xs text-muted-foreground">{bytesRemaining} left</span>
            </div>
            <Textarea
              id="zap-note"
              value={zapNote}
              onChange={(e) => setZapNote(truncateToByteLength(e.target.value, zapCommentLimit))}
              placeholder={`Message for ${targetName}…`}
              className="h-16 resize-none text-sm"
            />
          </div>

          {/* Privacy toggle */}
          {showPrivacyToggle && (
            <label className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={preferAnonymousZap}
                onChange={(e) => onTogglePrivacy?.(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div className="flex items-center gap-1.5">
                <ShieldCheckIcon className="h-3.5 w-3.5" />
                <span>Private zap (anonymous signature)</span>
              </div>
            </label>
          )}

          {/* Invoice section */}
          {zapState.invoice ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Invoice</span>
                {zapState.paid && <Badge variant="default" className="text-xs">Paid</Badge>}
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
                  {zapState.status === "invoice-ready" && (
                    <Button size="sm" variant="ghost" onClick={handleRetry} disabled={isZapInFlight}>
                      Retry WebLN
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
            <Button className="w-full" size="lg" onClick={handleSend} disabled={ctaDisabled}>
              {isZapInFlight ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Zap {formatSats(resolvedZapAmount)} sats
                </>
              )}
            </Button>
          )}

          {/* Lightning address info (if already known) */}
          {lightningId && (
            <p className="text-xs text-muted-foreground truncate">
              ⚡ {lightningId}
            </p>
          )}
        </div>

        {/* Stats sidebar */}
        <aside className="space-y-3 lg:border-l lg:pl-4">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            <StatBox label="Total" value={`${formatSats(zapInsights.totalSats)}`} />
            <StatBox label="Zappers" value={formatSats(zapInsights.uniqueSenders)} />
            <StatBox label="Average" value={`${formatSats(zapInsights.averageSats)}`} />
            <StatBox label="Your zaps" value={hasZappedWithLightning ? formatSats(viewerZapTotalSats) : "—"} />
          </div>

          {/* Recent zaps */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recentZaps.length === 0 ? (
                <p className="text-xs text-muted-foreground">No zaps yet</p>
              ) : (
                recentZaps.slice(0, recentZapsLimit).map((zap) => (
                  <ZapRow key={zap.id} zap={zap} />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </DialogContent>
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
          <pre className="text-[9px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all max-h-24 overflow-auto">
            {JSON.stringify(zap.event || zap, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
