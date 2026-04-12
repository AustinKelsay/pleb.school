'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Eye, Play, User } from 'lucide-react'
import type { NostrEvent } from 'snstr'

import { parseEvent } from '@/data/types'
import type { CommentThreadsQueryResult } from '@/hooks/useCommentThreads'
import type { NormalizedProfile } from '@/hooks/useNostr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExpandableText } from '@/components/ui/expandable-text'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ViewsText } from '@/components/ui/views-text'
import { DeferredPurchaseDialog } from '@/components/purchase/deferred-purchase-dialog'

interface ContentMetadataProps {
  event: NostrEvent
  parsedEvent: ReturnType<typeof parseEvent>
  resourceKey: string
  serverPrice: number | null
  serverPurchased: boolean
  serverIsOwner?: boolean
  unlockedViaCourse?: boolean
  interactionData: CommentThreadsQueryResult
  authorName: string
  authorPubkey: string
  authorProfile: NormalizedProfile | null
  relayHints?: string[]
  onUnlock?: () => void
  hidePrimaryCta?: boolean
  showSocialMetrics?: boolean
  viewCount?: number | null
}

function ContentMetadata({
  event,
  parsedEvent,
  resourceKey,
  serverPrice,
  serverPurchased,
  serverIsOwner = false,
  unlockedViaCourse = false,
  interactionData,
  authorName,
  authorPubkey,
  authorProfile,
  relayHints = [],
  onUnlock,
  hidePrimaryCta = false,
  showSocialMetrics = true,
  viewCount
}: ContentMetadataProps) {
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const {
    commentMetrics,
    interactions,
    isLoading: interactionsLoading,
    hasReacted,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats,
    viewerZapReceipts
  } = interactionData

  const zapsCount = interactions.zaps
  const commentsCount = commentMetrics.totalComments
  const reactionsCount = interactions.likes
  const parsedPriceRaw = parsedEvent.price
  const parsedPrice = Number.isFinite(Number(parsedPriceRaw)) ? Number(parsedPriceRaw) : null
  const priceSats =
    serverPrice !== null && serverPrice !== undefined
      ? serverPrice
      : parsedPrice ?? 0
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const resourceIdIsUuid = uuidRegex.test(resourceKey)

  const isPremiumFromParsed = parsedEvent.isPremium === true
  const isPremiumFromTags = event.tags?.some(
    (tag) => Array.isArray(tag) && tag.length >= 2 && tag[0] === 'isPremium' && tag[1] === 'true'
  )
  const derivedPremiumFlag =
    isPremiumFromParsed ||
    isPremiumFromTags ||
    event.kind === 30402 ||
    Boolean(parsedEvent.price && parseFloat(parsedEvent.price) > 0)
  const isPremium = Boolean(derivedPremiumFlag)

  const lockable = isPremium && resourceIdIsUuid && priceSats > 0
  const hasAccess = !lockable || serverPurchased || serverIsOwner || unlockedViaCourse
  const canPurchase = lockable && !hasAccess
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const viewsElement = useMemo(() => {
    if (!showSocialMetrics) {
      return null
    }

    if (viewCount === undefined) {
      return <ViewsText ns="content" id={resourceKey} notation="compact" />
    }

    return <ViewsText ns="content" id={resourceKey} notation="compact" count={viewCount} />
  }, [resourceKey, showSocialMetrics, viewCount])

  return (
    <div className="space-y-4">
      <div className="flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-muted-foreground">
        <div className="flex items-center space-x-1">
          <User className="h-4 w-4" />
          <span>{authorName}</span>
        </div>

        <div className="flex items-center space-x-1">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(event.created_at)}</span>
        </div>

        {viewsElement ? (
          <div className="flex items-center space-x-1">
            <Eye className="h-4 w-4" />
            {viewsElement}
          </div>
        ) : null}

        {parsedEvent.type === 'video' && (
          <div className="flex items-center space-x-1">
            <Play className="h-4 w-4" />
            <span>Video</span>
          </div>
        )}
      </div>

      {showSocialMetrics ? (
        <InteractionMetrics
          zapsCount={zapsCount}
          commentsCount={commentsCount}
          likesCount={reactionsCount}
          isLoadingZaps={interactionsLoading}
          isLoadingComments={interactionsLoading}
          isLoadingLikes={interactionsLoading}
          hasReacted={hasReacted}
          eventId={event.id}
          eventKind={event.kind}
          eventPubkey={event.pubkey}
          eventIdentifier={parsedEvent.d}
          zapInsights={zapInsights}
          recentZaps={recentZaps}
          hasZappedWithLightning={hasZappedWithLightning}
          viewerZapTotalSats={viewerZapTotalSats}
          zapTarget={{
            pubkey: authorPubkey,
            lightningAddress: authorProfile?.lud16 || undefined,
            name: authorName || parsedEvent.author || undefined,
            relayHints
          }}
        />
      ) : null}

      {!hidePrimaryCta && (
        <div className="mt-4">
          {hasAccess ? (
            <Button
              className="w-full sm:w-auto"
              size="lg"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              {parsedEvent.type === 'video' ? 'Watch Now' : 'Read Now'}
            </Button>
          ) : canPurchase ? (
            <>
              <Button
                className="w-full sm:w-auto"
                size="lg"
                onClick={() => setShowPurchaseDialog(true)}
              >
                Purchase for {priceSats.toLocaleString()} sats
              </Button>
              <DeferredPurchaseDialog
                isOpen={showPurchaseDialog}
                onOpenChange={setShowPurchaseDialog}
                title={parsedEvent.title || 'Untitled resource'}
                priceSats={priceSats}
                resourceId={resourceKey}
                eventId={event.id}
                eventKind={event.kind}
                eventIdentifier={parsedEvent.d}
                eventPubkey={authorPubkey}
                zapTarget={{
                  pubkey: authorPubkey,
                  lightningAddress: authorProfile?.lud16 || undefined,
                  name: authorName || parsedEvent.author || undefined,
                  relayHints
                }}
                viewerZapTotalSats={viewerZapTotalSats}
                alreadyPurchased={serverPurchased}
                zapInsights={zapInsights}
                recentZaps={recentZaps}
                viewerZapReceipts={viewerZapReceipts}
                onPurchaseComplete={(purchase) => {
                  const snapshot = purchase?.priceAtPurchase
                  const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
                  const required = Math.min(snapshotValid ? snapshot : priceSats, priceSats)
                  if ((purchase?.amountPaid ?? 0) >= required) {
                    onUnlock?.()
                  }
                }}
              />
            </>
          ) : (
            <Badge variant="outline" className="px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">
              Purchase not available for this identifier
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

export interface ResourceMetadataHeroProps {
  event: NostrEvent
  parsedEvent: ReturnType<typeof parseEvent>
  resourceId: string
  serverPrice: number | null
  serverPurchased: boolean
  serverIsOwner?: boolean
  unlockedViaCourse?: boolean
  interactionData: CommentThreadsQueryResult
  authorName: string
  authorPubkey: string
  authorProfile: NormalizedProfile | null
  relayHints?: string[]
  onUnlock?: () => void
  showBackLink?: boolean
  backHref?: string
  isPremium: boolean
  hidePrimaryCta?: boolean
  rightCtas?: React.ReactNode
  bottomRightCta?: React.ReactNode
  showSocialMetrics?: boolean
  viewCount?: number | null
}

export function ResourceMetadataHero({
  event,
  parsedEvent,
  resourceId,
  serverPrice,
  serverPurchased,
  serverIsOwner = false,
  unlockedViaCourse = false,
  interactionData,
  authorName,
  authorPubkey,
  authorProfile,
  relayHints = [],
  onUnlock,
  showBackLink,
  backHref,
  isPremium,
  hidePrimaryCta = false,
  rightCtas,
  bottomRightCta,
  showSocialMetrics = true,
  viewCount
}: ResourceMetadataHeroProps) {
  const rawSummary = parsedEvent.summary?.trim() || ''
  const category = parsedEvent.topics?.[0] || 'general'
  const type = parsedEvent.type || 'document'
  const heroImage = parsedEvent.image && parsedEvent.image !== '/placeholder.svg' ? parsedEvent.image : null
  const heroImageClassName = 'opacity-55 scale-100'
  const heroGradientClassName = 'from-background/80 via-background/65 to-background'

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card">
      {heroImage && (
        <>
          <OptimizedImage
            src={heroImage}
            alt={parsedEvent.title || 'Resource artwork'}
            fill
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${heroImageClassName}`}
            sizes="(max-width: 768px) 100vw, 80vw"
            priority={false}
          />
          <div className={`absolute inset-0 bg-gradient-to-b ${heroGradientClassName}`} />
        </>
      )}

      <div className="relative z-10 p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">
              {category}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {type}
            </Badge>
            {isPremium && (
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                Premium
              </Badge>
            )}
            {unlockedViaCourse && (
              <Badge variant="outline" className="border-success/60 text-success bg-success/10">
                Access via course
              </Badge>
            )}
          </div>

          {(rightCtas || (showBackLink && backHref)) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto justify-end">
              {rightCtas ? rightCtas : (
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
                  <Link href={backHref!}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Overview
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
            {parsedEvent.title || 'Untitled resource'}
          </h1>
          {rawSummary && (
            <ExpandableText
              text={rawSummary}
              className="max-w-3xl"
              textClassName="text-base text-muted-foreground/90"
            />
          )}
        </div>

        <ContentMetadata
          event={event}
          parsedEvent={parsedEvent}
          resourceKey={resourceId}
          serverPrice={serverPrice}
          serverPurchased={serverPurchased}
          serverIsOwner={serverIsOwner}
          unlockedViaCourse={unlockedViaCourse}
          interactionData={interactionData}
          authorName={authorName}
          authorPubkey={authorPubkey}
          authorProfile={authorProfile}
          relayHints={relayHints}
          onUnlock={onUnlock}
          hidePrimaryCta={hidePrimaryCta}
          showSocialMetrics={showSocialMetrics}
          viewCount={viewCount}
        />

        {bottomRightCta ? (
          <div className="flex justify-end">
            {bottomRightCta}
          </div>
        ) : null}
      </div>
    </div>
  )
}
