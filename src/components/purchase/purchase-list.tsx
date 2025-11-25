"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Receipt as ReceiptIcon,
  RefreshCw,
  User as UserIcon,
  Video,
  Zap
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { usePurchasesQuery, type PurchasesScope } from "@/hooks/usePurchasesQuery"
import { useResourceNotes } from "@/hooks/useResourceNotes"
import { useCourseNotes } from "@/hooks/useCourseNotes"
import { getNoteImage } from "@/lib/note-image"
import type { PurchaseListItem, PurchaseStats, ReceiptSummary, TraceStep } from "@/types/purchases"

type PurchaseListProps = {
  scope?: PurchasesScope
  limit?: number
  showUser?: boolean
  showSummary?: boolean
  emptyMessage?: string
  purchases?: PurchaseListItem[]
  stats?: PurchaseStats | null
  isLoading?: boolean
  error?: string | null
  refetch?: () => void
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return "just now"
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)}d ago`
  if (diffSeconds < 31536000) return `${Math.floor(diffSeconds / 2592000)}mo ago`
  return `${Math.floor(diffSeconds / 31536000)}y ago`
}

function formatSats(value?: number | null) {
  if (typeof value !== "number") return "—"
  return `${value.toLocaleString()} sats`
}

function statusVariant(status: string) {
  switch (status) {
    case "unlocked":
      return "default"
    case "partial":
      return "secondary"
    case "refunded":
      return "destructive"
    default:
      return "outline"
  }
}

function getContentIcon(contentType: string, videoId?: string | null) {
  if (contentType === "course") return BookOpen
  if (videoId) return Video
  return FileText
}

function SummaryStrip({ stats }: { stats: PurchaseStats | null }) {
  if (!stats) return null

  const items = [
    { label: "Total revenue", value: formatSats(stats.totalRevenueSats) },
    { label: "Purchases", value: stats.totalPurchases.toLocaleString() },
    { label: "Unlocked", value: stats.unlockedCount.toLocaleString() },
    { label: "Partial", value: stats.partialCount.toLocaleString() },
    { label: "Refunded", value: stats.refundCount.toLocaleString() },
    { label: "Avg ticket", value: formatSats(stats.averageTicketSats) }
  ]

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-card/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="text-base font-semibold">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function ReceiptItem({ receipt }: { receipt: ReceiptSummary }) {
  const [open, setOpen] = useState(false)
  const canExpand = Boolean(receipt.raw)

  return (
    <div className="rounded-md border border-border/50 bg-muted/30">
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        className="w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ReceiptIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground font-mono">
            {receipt.id.length > 18 ? `${receipt.id.slice(0, 18)}…` : receipt.id}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            {formatSats(receipt.amountSats)}
          </Badge>
          {receipt.createdAt && (
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(new Date(receipt.createdAt * 1000).toISOString())}
            </span>
          )}
          {canExpand && (
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>
      {open && canExpand && (
        <div className="border-t border-border/60 bg-background/60 px-3 pb-3">
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border/50 bg-muted/40 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all font-mono">
            {JSON.stringify(receipt.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function TraceTimeline({ steps }: { steps: TraceStep[] }) {
  if (!steps?.length) return null
  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div key={`${step.label}-${idx}`} className="flex items-start gap-2 text-xs">
          <div className="mt-0.5 shrink-0">
            {step.kind === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : step.kind === "warning" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="font-medium">{step.label}</div>
            {step.detail && (
              <p className="text-muted-foreground">{step.detail}</p>
            )}
            {step.at && (
              <p className="text-muted-foreground font-mono">
                {formatDate(step.at)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

type EnrichedPurchase = PurchaseListItem & {
  enrichedTitle?: string
  enrichedImage?: string
  enrichedDescription?: string
  enrichedTopics?: string[]
}

function PurchaseCard({ 
  purchase, 
  showUser 
}: { 
  purchase: EnrichedPurchase
  showUser?: boolean 
}) {
  const [showDetails, setShowDetails] = useState(false)
  
  const progress = useMemo(() => {
    if (purchase.priceSats <= 0) return 100
    return Math.min(100, Math.round((purchase.amountPaid / purchase.priceSats) * 100))
  }, [purchase.amountPaid, purchase.priceSats])

  const renderContentIcon = (className: string) => {
    if (purchase.contentType === "course") return <BookOpen className={className} />
    if (purchase.videoId) return <Video className={className} />
    return <FileText className={className} />
  }
  const displayTitle = purchase.enrichedTitle || purchase.title || `${purchase.contentType === "course" ? "Course" : "Content"}`
  const displayImage = purchase.enrichedImage || purchase.thumbnail || purchase.image
  const displayDescription = purchase.enrichedDescription || purchase.description
  const isUnlocked = purchase.status === "unlocked"

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 hover:border-border transition-colors">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
          {displayImage ? (
            <OptimizedImage
              src={displayImage}
              alt={displayTitle}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              {renderContentIcon("h-8 w-8 text-primary/60")}
            </div>
          )}
          {/* Content type badge overlay */}
          <div className="absolute top-1.5 left-1.5 p-1 rounded bg-background/80 backdrop-blur-sm">
            {renderContentIcon("h-3 w-3 text-foreground")}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {purchase.contentType}
                </Badge>
                <Badge variant={statusVariant(purchase.status)} className="text-xs capitalize">
                  {purchase.status}
                </Badge>
                {purchase.lessonCount != null && purchase.lessonCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {purchase.lessonCount} lessons
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-sm sm:text-base leading-tight line-clamp-2">
                {displayTitle}
              </h3>
              {displayDescription && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {displayDescription}
                </p>
              )}
            </div>
            
            {/* Link */}
            {purchase.href && (
              <Link 
                href={purchase.href} 
                className="shrink-0 p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span className="font-medium text-foreground">{formatSats(purchase.amountPaid)}</span>
              {purchase.priceSats > 0 && (
                <span>/ {formatSats(purchase.priceSats)}</span>
              )}
            </div>
            
            {purchase.receiptCount > 0 && (
              <span>{purchase.receiptCount} receipt{purchase.receiptCount !== 1 ? "s" : ""}</span>
            )}
            
            <span>{formatTimeAgo(purchase.createdAt)}</span>
            
            {showUser && purchase.user && (
              <div className="flex items-center gap-1">
                {purchase.user.avatar ? (
                  <OptimizedImage
                    src={purchase.user.avatar}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-full"
                  />
                ) : (
                  <UserIcon className="h-3 w-3" />
                )}
                <span className="truncate max-w-[100px]">
                  {purchase.user.username || purchase.user.email?.split("@")[0] || purchase.user.id.slice(0, 8)}
                </span>
              </div>
            )}
          </div>

          {/* Progress bar for partial payments */}
          {!isUnlocked && purchase.priceSats > 0 && (
            <div className="flex items-center gap-2">
              <Progress value={progress} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground shrink-0">{progress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Expandable details section */}
      <div className="border-t border-border/40">
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <ReceiptIcon className="h-3.5 w-3.5" />
            Details & receipts
          </span>
          {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        
        {showDetails && (
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Lifecycle */}
            {purchase.lifeCycle?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Lifecycle
                </p>
                <TraceTimeline steps={purchase.lifeCycle} />
              </div>
            )}

            {/* Receipts */}
            {purchase.receipts && purchase.receipts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Zap Receipts
                </p>
                <div className="space-y-1.5">
                  {purchase.receipts.slice(0, 5).map((receipt) => (
                    <ReceiptItem key={receipt.id} receipt={receipt} />
                  ))}
                  {purchase.receipts.length > 5 && (
                    <p className="text-xs text-muted-foreground px-3">
                      +{purchase.receipts.length - 5} more receipt{purchase.receipts.length - 5 === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Invoice */}
            {purchase.invoice && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Invoice
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all line-clamp-3">
                  {purchase.invoice}
                </p>
              </div>
            )}
          </CardContent>
        )}
      </div>
    </Card>
  )
}

export function PurchaseList(props: PurchaseListProps) {
  const {
    scope = "mine",
    limit,
    showUser = false,
    showSummary = true,
    emptyMessage = "No purchases yet.",
    purchases: providedPurchases,
    stats: providedStats,
    isLoading: providedLoading,
    error: providedError,
    refetch: providedRefetch
  } = props

  const shouldFetch = !providedPurchases
  const query = usePurchasesQuery({ scope, limit, enabled: shouldFetch })

  const purchases = useMemo(
    () => providedPurchases ?? query.purchases ?? [],
    [providedPurchases, query.purchases]
  )

  const stats = providedStats ?? query.stats ?? null
  const isLoading = providedLoading ?? query.isLoading
  const error = providedError ?? (query.isError ? query.error?.message : null)
  const refetch = providedRefetch ?? query.refetch

  // Extract content IDs for note enrichment
  const { resourceIds, courseIds } = useMemo(() => {
    const resourceIds: string[] = []
    const courseIds: string[] = []
    
    for (const p of purchases) {
      const contentId = p.contentId || p.resourceId || p.courseId
      if (!contentId) continue
      
      if (p.contentType === "course" && p.courseId) {
        courseIds.push(p.courseId)
      } else if (p.resourceId) {
        resourceIds.push(p.resourceId)
      }
    }
    
    return { 
      resourceIds: [...new Set(resourceIds)], 
      courseIds: [...new Set(courseIds)] 
    }
  }, [purchases])

  // Fetch notes for enrichment
  const resourceNotes = useResourceNotes(resourceIds, { enabled: resourceIds.length > 0 })
  const courseNotes = useCourseNotes(courseIds, { enabled: courseIds.length > 0 })

  // Enrich purchases with note data
  const enrichedPurchases = useMemo<EnrichedPurchase[]>(() => {
    return purchases.map((purchase) => {
      const contentId = purchase.contentId || purchase.resourceId || purchase.courseId
      if (!contentId) return purchase

      let noteResult
      if (purchase.contentType === "course" && purchase.courseId) {
        noteResult = courseNotes.notes.get(purchase.courseId)
      } else if (purchase.resourceId) {
        noteResult = resourceNotes.notes.get(purchase.resourceId)
      }

      if (!noteResult?.note) return purchase

      const note = noteResult.note
      const tags = note.tags || []

      // Extract metadata from note tags
      const getTag = (key: string) => tags.find((t) => t[0] === key)?.[1]
      
      const enrichedTitle = 
        getTag("title") || 
        getTag("name") || 
        purchase.title
        
      const enrichedDescription = 
        getTag("summary") || 
        getTag("description") || 
        getTag("about") ||
        purchase.description

      // Get image from note
      const noteImage = getNoteImage(note)
      const enrichedImage = 
        noteImage || 
        purchase.thumbnail || 
        purchase.image

      const enrichedTopics = tags
        .filter((t) => t[0] === "t")
        .map((t) => t[1])
        .filter(Boolean)

      return {
        ...purchase,
        enrichedTitle,
        enrichedImage,
        enrichedDescription,
        enrichedTopics
      }
    })
  }, [purchases, resourceNotes.notes, courseNotes.notes])

  const isNotesLoading = resourceNotes.isLoading || courseNotes.isLoading

  if (isLoading) {
    return (
      <div className="space-y-3">
        {showSummary && <Skeleton className="h-16 w-full" />}
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Unable to load purchases</AlertTitle>
        <AlertDescription className="flex items-center gap-2">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!purchases.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="p-3 rounded-full bg-muted">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">{emptyMessage}</p>
            <p className="text-sm text-muted-foreground">
              When users purchase content, their transactions will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {showSummary && <SummaryStrip stats={stats} />}
      
      {isNotesLoading && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading content details...
        </p>
      )}
      
      <div className="space-y-3">
        {enrichedPurchases.map((purchase) => (
          <PurchaseCard 
            key={purchase.id} 
            purchase={purchase} 
            showUser={showUser} 
          />
        ))}
      </div>
    </div>
  )
}
