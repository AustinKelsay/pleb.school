"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { ChevronDown, ChevronUp } from "lucide-react"

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
import { useToast } from "@/hooks/use-toast"
import { useZapFormState, MIN_CUSTOM_ZAP, QUICK_ZAP_AMOUNTS } from "@/hooks/useZapFormState"
import { getByteLength, truncateToByteLength } from "@/lib/lightning"
import type { LightningRecipient, ZapSendResult } from "@/types/zap"
import type { ZapInsights, ZapReceiptSummary } from "@/hooks/useInteractions"
import type { ZapState } from "@/hooks/useZapSender"
import { useSession } from "next-auth/react"

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
  const [showInvoiceQr, setShowInvoiceQr] = useState(false)

  const zapCommentLimitBytes = zapState.metadata?.commentAllowed ?? 280
  const zapNoteBytesRemaining = Math.max(0, zapCommentLimitBytes - getByteLength(zapNote))

  const zapTargetName = zapTarget?.name || "this creator"
  const zapLightningIdentifier =
    zapTarget?.lightningAddress ||
    zapTarget?.lnurl ||
    zapState.lnurlDetails?.identifier ||
    zapState.lnurlDetails?.endpointUrl ||
    ""
  const zapTargetHasLightning = Boolean(zapLightningIdentifier)

  const belowMinAmount = typeof minZapSats === "number" ? resolvedZapAmount < minZapSats : false
  const aboveMaxAmount = typeof maxZapSats === "number" ? resolvedZapAmount > maxZapSats : false
  const amountOutOfRange = belowMinAmount || aboveMaxAmount
  const zapActionUnavailable =
    customAmountInvalid ||
    resolvedZapAmount < MIN_CUSTOM_ZAP ||
    amountOutOfRange
  const zapCtaDisabled = zapActionUnavailable || isZapInFlight
  const lightningAddressDisplay = zapLightningIdentifier || "Creator has not linked a lightning address yet."

  const zapStatusMessages: Record<string, string> = {
    resolving: "Resolving lightning address…",
    signing: "Creating zap request…",
    "requesting-invoice": "Waiting for the wallet invoice…",
    paying: "Attempting WebLN payment…",
    "invoice-ready": zapState.weblnError
      ? "Invoice ready. Pay manually or retry WebLN."
      : "Invoice ready. Open your Lightning wallet to finish.",
    success: "Zap paid! Receipt will appear once the relay publishes it.",
    error: zapState.error || "Zap failed. Adjust the amount or try again."
  }
  const zapDialogStatusMessage = zapStatusMessages[zapState.status] || ""

  const zapActivityPreview = recentZaps
  const zapStats = zapInsights
  const isAuthed = sessionStatus === "authenticated"
  const showPrivacyToggle = isAuthed && !session?.user?.privkey

  const viewerZapSummaryText = zapState.status === "success"
    ? "Zap sent! Receipts usually land within a few seconds."
    : hasZappedWithLightning
      ? `You have tipped ${formatSatsDisplay(viewerZapTotalSats)} so far.`
      : "You have not zapped this content yet."

  const zapCommentLimitLabel = zapState.metadata?.commentAllowed
    ? `wallet allows up to ${zapState.metadata.commentAllowed}`
    : "wallet default is 280"

  useEffect(() => {
    if (!isOpen) {
      resetForm()
      resetZapState()
    }
  }, [isOpen, resetForm, resetZapState])

  useEffect(() => {
    setShowInvoiceQr(Boolean(zapState.invoice))
  }, [zapState.invoice])

  const handleSendZap = useCallback(async () => {
    if (zapActionUnavailable) {
      toast({
        title: "Adjust zap amount",
        description: amountOutOfRange
          ? `Pick an amount between ${minZapSats?.toLocaleString() ?? "—"} and ${maxZapSats?.toLocaleString() ?? "—"} sats.`
          : `Enter at least ${MIN_CUSTOM_ZAP} sat to send a zap.`,
        variant: "destructive"
      })
      return
    }

    try {
      const result = await sendZap({ amountSats: resolvedZapAmount, note: zapNote })
      toast({
        title: result.paid ? "Zap sent ⚡️" : "Invoice ready",
        description: result.paid
          ? "Thanks for supporting the creator!"
          : "Copy the invoice below or open it in your Lightning wallet to finish."
      })
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to send zap."
      toast({ title: "Zap failed", description, variant: "destructive" })
    }
  }, [amountOutOfRange, maxZapSats, minZapSats, resolvedZapAmount, sendZap, toast, zapActionUnavailable, zapNote])

  const handleCopyInvoice = useCallback(async () => {
    if (!zapState.invoice) {
      return
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast({
        title: "Clipboard unavailable",
        description: "Copy the invoice manually from the text block below.",
        variant: "destructive"
      })
      return
    }
    try {
      await navigator.clipboard.writeText(zapState.invoice)
      toast({ title: "Invoice copied", description: "Paste into any Lightning wallet to pay." })
    } catch (error) {
      toast({
        title: "Unable to copy invoice",
        description: error instanceof Error ? error.message : "Clipboard access denied.",
        variant: "destructive"
      })
    }
  }, [toast, zapState.invoice])

  const handleRetryWebln = useCallback(async () => {
    const paid = await retryWeblnPayment()
    toast({
      title: paid ? "Zap paid via WebLN" : "WebLN payment failed",
      description: paid
        ? "Thanks for the zap!"
        : "Copy the invoice below or open it in your wallet to finish.",
      variant: paid ? "default" : "destructive"
    })
  }, [retryWeblnPayment, toast])

  return (
    <DialogContent
      className="max-w-3xl sm:max-w-4xl lg:max-w-5xl lg:max-h-[85vh]"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>Send a zap</DialogTitle>
        <DialogDescription>
          Lightning tips — also called zaps — let you support {zapTargetName}. We’ll resolve their Lightning address,
          request an invoice, and try WebLN automatically if your wallet allows it.
          {!isAuthed && (
            <span className="block text-xs text-muted-foreground mt-1">
              You can tip without signing in; purchases still require an account.
            </span>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:h-[60vh] lg:overflow-hidden">
        <section className="space-y-4 lg:overflow-y-auto lg:pr-2">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {viewerZapSummaryText}
          </div>

          {zapDialogStatusMessage && (
            <div
              className={
                zapState.status === "error"
                  ? "rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  : "rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
              }
            >
              {zapDialogStatusMessage}
            </div>
          )}

          {zapState.weblnError && (
            <p className="text-xs text-destructive">WebLN error: {zapState.weblnError}</p>
          )}

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Choose an amount</Label>
              <span className="text-xs text-muted-foreground">Selected: {formatSatsDisplay(resolvedZapAmount)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ZAP_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => handleSelectQuickAmount(amount)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    selectedZapAmount === amount && !hasCustomAmount
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:border-primary"
                  }`}
                >
                  {amount.toLocaleString()} sats
                </button>
              ))}
              <div className="flex flex-col">
                <Label htmlFor="custom-zap" className="text-xs text-muted-foreground">
                  Custom
                </Label>
                <Input
                  id="custom-zap"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="420"
                  value={customZapAmount}
                  onChange={(event) => handleCustomAmountChange(event.target.value)}
                  className="h-9 w-28"
                />
              </div>
            </div>

            {showPrivacyToggle && (
              <div className="flex items-start gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
                <input
                  id="zap-privacy-toggle"
                  type="checkbox"
                  checked={preferAnonymousZap}
                  onChange={(e) => onTogglePrivacy?.(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                <label htmlFor="zap-privacy-toggle" className="leading-relaxed">
                  Keep my zap private (sign with a fresh, anonymous key). We’ll still attach the purchase to your account.
                </label>
              </div>
            )}
            {customAmountInvalid && (
              <p className="text-xs text-destructive">Enter at least {MIN_CUSTOM_ZAP} sat.</p>
            )}
            {(minZapSats || maxZapSats) && (
              <p className="text-xs text-muted-foreground">
                Range: {minZapSats?.toLocaleString() ?? "—"} – {maxZapSats?.toLocaleString() ?? "—"} sats
              </p>
            )}
            {amountOutOfRange && (
              <p className="text-xs text-destructive">Choose an amount within the allowed range.</p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="zap-note">Add a note (optional)</Label>
            <Textarea
              id="zap-note"
              value={zapNote}
              onChange={(event) => {
                const value = event.target.value
                const truncated = truncateToByteLength(value, zapCommentLimitBytes)
                setZapNote(truncated)
              }}
              placeholder={`Tell ${zapTargetName} why this resonated.`}
            />
            <p className="text-xs text-muted-foreground">
              {zapNoteBytesRemaining} bytes left ({zapCommentLimitLabel})
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p className="font-medium text-foreground">Lightning address</p>
            <p className="break-all text-muted-foreground">{lightningAddressDisplay}</p>
            {zapTarget?.pubkey && (
              <p className="text-xs text-muted-foreground">Pubkey: {formatShortPubkey(zapTarget.pubkey)}</p>
            )}
            {!zapTargetHasLightning && (
              <p className="text-xs text-destructive">Ask the author to add a Lightning address to their profile.</p>
            )}
          </div>

          <Button className="w-full" size="lg" onClick={handleSendZap} disabled={zapCtaDisabled}>
            {isZapInFlight ? "Sending zap…" : `Send ${resolvedZapAmount.toLocaleString()} sats`}
          </Button>

          {zapState.invoice && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Invoice</Label>
                {zapState.paid && <span className="text-xs text-success">paid</span>}
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                {zapState.invoice}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handleCopyInvoice}>
                  Copy invoice
                </Button>
                <Button variant="outline" asChild>
                  <a href={`lightning:${zapState.invoice}`}>
                    Open wallet
                  </a>
                </Button>
                {zapState.status === "invoice-ready" && (
                  <Button variant="ghost" onClick={handleRetryWebln} disabled={isZapInFlight}>
                    Retry WebLN
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowInvoiceQr((prev) => !prev)}>
                  {showInvoiceQr ? "Hide QR" : "Show QR"}
                </Button>
              </div>
              {showInvoiceQr && (
                <div className="flex items-center justify-center rounded-md border bg-background p-4">
                  <QRCode
                    value={zapState.invoice}
                    size={192}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    fgColor="hsl(var(--foreground))"
                    bgColor="#ffffff"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:flex lg:flex-col lg:pl-2 lg:h-full lg:min-h-0">
          <StatGrid zapStats={zapStats} />

          <div className="space-y-3 rounded-lg border p-4 lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent supporters</p>
              <span className="text-xs text-muted-foreground">Live preview</span>
            </div>
            <SupporterList supporters={zapActivityPreview} />
          </div>
        </aside>
      </div>
    </DialogContent>
  )
}

function StatGrid({ zapStats }: { zapStats: ZapInsights }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <StatCard label="Total sats" value={formatNumberDisplay(zapStats.totalSats)} />
      <StatCard label="Supporters" value={formatNumberDisplay(zapStats.uniqueSenders)} />
      <StatCard label="Avg. zap" value={formatSatsDisplay(zapStats.averageSats)} />
      <StatCard label="Last zap" value={formatRelativeTimestamp(zapStats.lastZapAt)} />
    </div>
  )
}

function SupporterList({ supporters }: { supporters: ZapReceiptSummary[] }) {
  const [visibleCount, setVisibleCount] = useState(10)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    setVisibleCount(10)
    setIsLoadingMore(false)
  }, [supporters.length])

  const loadMore = () => {
    if (isLoadingMore || visibleCount >= supporters.length) return
    setIsLoadingMore(true)
    // Small delay for a subtle animation and to avoid thrashing
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(supporters.length, prev + 10))
      setIsLoadingMore(false)
    }, 120)
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget
    const atBottom = scrollTop + clientHeight >= scrollHeight - 24
    if (atBottom) {
      loadMore()
    } else if (isLoadingMore) {
      // reset indicator if user scrolls away from bottom
      setIsLoadingMore(false)
    }
  }

  if (supporters.length === 0) {
    return <p className="text-sm text-muted-foreground">No zaps yet. Be the first to zap this drop.</p>
  }

  return (
    <div className="space-y-2 max-h-72 lg:max-h-none lg:flex-1 overflow-y-auto pr-1 lg:min-h-0" onScroll={handleScroll}>
      {supporters.slice(0, visibleCount).map((zap) => (
        <ZapItem key={zap.id} zap={zap} />
      ))}
      {visibleCount < supporters.length && (
        <div className="pt-2 pb-1 flex justify-center">
          <span className="text-xs text-muted-foreground animate-pulse">
            Loading more supporters…
          </span>
        </div>
      )}
    </div>
  )
}

function ZapItem({ zap }: { zap: ZapReceiptSummary }) {
  const [expanded, setExpanded] = useState(false)
  // Prefer payer pubkeys or sender; never fall back to receiver (owner) to avoid misattribution.
  const zapPubkey = zap.payerPubkeys?.[0] || zap.senderPubkey || ""
  const zapPubkeyLabel = zapPubkey ? formatShortPubkey(zapPubkey) : "Anonymous"

  return (
    <div className="border rounded-md overflow-hidden transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-start text-sm p-3 text-left"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs">{formatSatsDisplay(zap.amountSats)}</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {zapPubkeyLabel}
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
            {zap.createdAt ? formatZapDate(zap.createdAt) : "—"}
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

interface StatCardProps {
  label: string
  value: string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

function formatNumberDisplay(value?: number | null): string {
  if (value === null || value === undefined) {
    return "—"
  }
  return value.toLocaleString()
}

function formatSatsDisplay(value?: number | null): string {
  if (value === null || value === undefined) {
    return "—"
  }
  return `${value.toLocaleString()} sats`
}

function formatShortPubkey(pubkey?: string | null): string {
  if (!pubkey || pubkey.length < 12) {
    return pubkey || "unknown zapper"
  }
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`
}

function formatRelativeTimestamp(seconds?: number | null): string {
  if (!seconds) {
    return "—"
  }

  const now = Date.now()
  const diffMs = now - seconds * 1000
  const safeDiff = Math.max(diffMs, 0)
  const minutes = Math.floor(safeDiff / 60000)

  if (minutes < 1) {
    return "just now"
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days}d ago`
  }

  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  })
}

function formatZapDate(seconds?: number | null): string {
  if (!seconds) {
    return "—"
  }

  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  })
}
