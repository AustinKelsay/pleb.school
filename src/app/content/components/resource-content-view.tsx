'use client'

import { useEffect, useMemo, useState } from 'react'
import React from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ExternalLink,
  Eye,
  FileText,
  Play,
  User,
  Video
} from 'lucide-react'
import { type AddressData, type EventData } from 'snstr'
import type { NostrEvent } from 'snstr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExpandableText } from '@/components/ui/expandable-text'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { parseEvent, type CourseUser } from '@/data/types'
import { useNostr, type NormalizedProfile } from '@/hooks/useNostr'
import { DeferredZapThreads } from '@/components/ui/deferred-zap-threads'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { useCommentThreads, type CommentThreadsQueryResult } from '@/hooks/useCommentThreads'
import { useProfileSummary } from '@/hooks/useProfileSummary'
import { extractVideoBodyMarkdown } from '@/lib/content-utils'
import { getRelays } from '@/lib/nostr-relays'
import { ViewsText } from '@/components/ui/views-text'
import { ResourceContentViewSkeleton } from '@/app/content/components/resource-skeletons'
import { resolveUniversalId } from '@/lib/universal-router'
import { DeferredPurchaseDialog } from '@/components/purchase/deferred-purchase-dialog'
import { AdditionalLinksCard } from '@/components/ui/additional-links-card'
import { profileSummaryFromUser, resolvePreferredDisplayName } from '@/lib/profile-display'
import { extractRelayHintsFromDecodedData } from '@/lib/relay-hints'

/**
 * Ensures video posts always have a playable URL by inferring legacy embeds when needed.
 */
function resolveVideoPlaybackUrl(
  parsedVideoUrl: string | undefined,
  rawContent: string,
  resourceType: string
): string | undefined {
  if (resourceType !== 'video') {
    return parsedVideoUrl?.trim() || undefined
  }

  if (parsedVideoUrl?.trim()) {
    return parsedVideoUrl.trim()
  }

  const legacyMatch = rawContent.match(/https?:\/\/[^\s<>()\[\]"']+/i)
  if (!legacyMatch) {
    return undefined
  }

  return legacyMatch[0].replace(/[.,;)]+$/, '')
}

interface ContentMetadataProps {
  event: NostrEvent
  parsedEvent: ReturnType<typeof parseEvent>
  resourceKey: string
  serverPrice: number | null
  serverPurchased: boolean
  interactionData: CommentThreadsQueryResult
  authorName: string
  authorPubkey: string
  authorProfile: NormalizedProfile | null
  relayHints?: string[]
  onUnlock?: () => void
  hidePrimaryCta?: boolean
}

function ContentMetadata({
  event,
  parsedEvent,
  resourceKey,
  serverPrice,
  serverPurchased,
  interactionData,
  authorName,
  authorPubkey,
  authorProfile,
  relayHints = [],
  onUnlock,
  hidePrimaryCta = false
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
  const hasAccess = !lockable || serverPurchased
  const canPurchase = lockable
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)

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

        <div className="flex items-center space-x-1">
          <Eye className="h-4 w-4" />
          <ViewsText ns="content" id={resourceKey} notation="compact" />
        </div>

        {parsedEvent.type === 'video' && (
          <div className="flex items-center space-x-1">
            <Play className="h-4 w-4" />
            <span>Video</span>
          </div>
        )}
      </div>

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

      {/* Primary CTA as a single button: Purchase if locked, Watch if unlocked */}
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
                  if ((purchase?.amountPaid ?? 0) >= (required ?? 0)) {
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

interface ResourceMetadataHeroProps {
  event: NostrEvent
  parsedEvent: ReturnType<typeof parseEvent>
  resourceId: string
  serverPrice: number | null
  serverPurchased: boolean
  unlockedViaCourse?: boolean
  unlockingCourseId?: string | null
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
}

export function ResourceMetadataHero({
  event,
  parsedEvent,
  resourceId,
  serverPrice,
  serverPurchased,
  unlockedViaCourse = false,
  unlockingCourseId = null,
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
  bottomRightCta
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
            interactionData={interactionData}
            authorName={authorName}
            authorPubkey={authorPubkey}
            authorProfile={authorProfile}
            relayHints={relayHints}
            onUnlock={onUnlock}
            hidePrimaryCta={hidePrimaryCta}
          />

        {bottomRightCta && (
          <div className="flex justify-end">
            {bottomRightCta}
          </div>
        )}
      </div>
    </div>
  )
}

export interface ResourceContentViewProps {
  resourceId: string
  initialEvent?: NostrEvent | null
  initialProfileSummary?: NormalizedProfile | null
  showBackLink?: boolean
  backHref?: string
  showHero?: boolean
  showAdditionalLinks?: boolean
  onMissingResource?: () => void
}

/**
 * Full resource reader that can optionally reuse a prefetched event (to avoid duplicate network work)
 * or fetch on demand when rendered inside the details route.
 */
export function ResourceContentView({
  resourceId,
  initialEvent,
  initialProfileSummary = null,
  showBackLink = false,
  backHref = `/content/${resourceId}`,
  showHero = true,
  showAdditionalLinks = true,
  onMissingResource
}: ResourceContentViewProps) {
  const { fetchSingleEvent } = useNostr()
  const { status: sessionStatus } = useSession()
  const [event, setEvent] = useState<NostrEvent | null>(initialEvent ?? null)
  const [loading, setLoading] = useState(!initialEvent)
  const [error, setError] = useState<string | null>(null)
  const [serverPrice, setServerPrice] = useState<number | null>(null)
  const [serverPurchased, setServerPurchased] = useState<boolean>(false)
  const [unlockedViaCourse, setUnlockedViaCourse] = useState<boolean>(false)
  const [unlockingCourseId, setUnlockingCourseId] = useState<string | null>(null)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [resourceUser, setResourceUser] = useState<CourseUser | null>(null)
  const resolvedIdentifier = useMemo(() => resolveUniversalId(resourceId), [resourceId])
  const routeRelayHints = useMemo(
    () => extractRelayHintsFromDecodedData(resolvedIdentifier?.decodedData),
    [resolvedIdentifier?.decodedData]
  )
  const parsedEventData = useMemo(() => (event ? parseEvent(event) : null), [event])
  const resolvedAuthorPubkey =
    parsedEventData?.authorPubkey ||
    resourceUser?.pubkey ||
    event?.pubkey ||
    null
  const seededAuthorProfile = useMemo(
    () => initialProfileSummary ?? profileSummaryFromUser(resourceUser),
    [initialProfileSummary, resourceUser]
  )
  const { profile: authorProfile } = useProfileSummary(resolvedAuthorPubkey, seededAuthorProfile, {
    enabled: Boolean(resolvedAuthorPubkey),
  })
  const interactionData = useCommentThreads(event?.id, {
    enabled: Boolean(event?.id),
    realtime: true,
    relayHints: routeRelayHints
  })
  const { zapInsights, recentZaps, viewerZapTotalSats, viewerZapReceipts } = interactionData
  const handleUnlock = () => setServerPurchased(true)

  useEffect(() => {
    let cancelled = false

    if (initialEvent) {
      // When the parent already fetched the event (e.g., overview route), reuse it immediately.
      setEvent(initialEvent)
      setLoading(false)
      setError(null)
      return () => {
        cancelled = true
      }
    }

    const fetchEvent = async () => {
      try {
        if (cancelled) return

        setLoading(true)
        setError(null)

        let nostrEvent: NostrEvent | null = null
        const resolved = resolvedIdentifier

        if (!resolved) {
          if (!cancelled) {
            setError('Unsupported identifier')
            setLoading(false)
          }
          return
        }

        if (resolved.idType === 'nevent' && resolved.decodedData && typeof resolved.decodedData === 'object') {
          if ('id' in resolved.decodedData) {
            const eventData = resolved.decodedData as EventData
            nostrEvent = await fetchSingleEvent({
              ids: [eventData.id]
            }, {
              relays: eventData.relays
            })
          }
        } else if (resolved.idType === 'naddr' && resolved.decodedData && typeof resolved.decodedData === 'object') {
          if ('identifier' in resolved.decodedData && 'kind' in resolved.decodedData) {
            const addressData = resolved.decodedData as AddressData
            nostrEvent = await fetchSingleEvent({
              kinds: [addressData.kind],
              '#d': [addressData.identifier],
              authors: addressData.pubkey ? [addressData.pubkey] : undefined
            }, {
              relays: addressData.relays
            })
          }
        } else if (resolved.idType === 'note' || resolved.idType === 'hex') {
          nostrEvent = await fetchSingleEvent({
            ids: [resolved.resolvedId]
          })
        } else {
          nostrEvent = await fetchSingleEvent({
            kinds: [30023, 30402, 30403],
            '#d': [resolved.resolvedId]
          })
        }

        if (cancelled) return

        if (nostrEvent) {
          setEvent(nostrEvent)
        } else {
          setError('Resource not found')
        }
      } catch (err) {
        console.error('Error fetching Nostr event:', err)
        if (!cancelled) {
          setError('Failed to fetch resource')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchEvent()

    return () => {
      cancelled = true
    }
  }, [resourceId, fetchSingleEvent, initialEvent, resolvedIdentifier])
  useEffect(() => {
    const controller = new AbortController()

    const fetchResourceMeta = async () => {
      const resetResourceMeta = () => {
        if (controller.signal.aborted) return
        setResourceUser(null)
        setServerPrice(null)
        setServerPurchased(false)
        setUnlockedViaCourse(false)
        setUnlockingCourseId(null)
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(resourceId)) {
        resetResourceMeta()
        return
      }

      resetResourceMeta()
      try {
        const res = await fetch(`/api/resources/${resourceId}`, {
          signal: controller.signal,
          credentials: 'include',
        })
        if (!res.ok || controller.signal.aborted) {
          resetResourceMeta()
          return
        }

        const body = await res.json()
        if (controller.signal.aborted) return

        const data = body?.data
        if (!controller.signal.aborted) {
          setResourceUser(data?.user ?? null)
        }
        if (!controller.signal.aborted && typeof data?.price === 'number') {
          setServerPrice(data.price)
        }
        if (!controller.signal.aborted) {
          const unlockedByPurchase =
            Array.isArray(data?.purchases) && typeof data?.price === 'number'
              ? data.purchases.some((p: any) => {
                  const snapshot = p?.priceAtPurchase
                  const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
                  const required = Math.min(snapshotValid ? snapshot : data.price, data.price)
                  return (p?.amountPaid ?? 0) >= required
                })
              : false
          const unlockedByCourse = data?.unlockedViaCourse === true
          const fromCourseId =
            data?.unlockingCourseId ||
            (Array.isArray(data?.lessons)
              ? data.lessons
                  .map((lesson: any) => lesson.course?.id || lesson.courseId)
                  .find((id: string | undefined) => Boolean(id))
              : null)
          setUnlockedViaCourse(unlockedByCourse)
          if (fromCourseId) {
            setUnlockingCourseId(fromCourseId)
          }
          setServerPurchased(unlockedByPurchase || unlockedByCourse)
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError' || controller.signal.aborted) {
          return
        }
        resetResourceMeta()
        console.error('Failed to fetch resource meta', err)
      }
    }

    // Only fetch when session status settled to include auth cookies
    if (sessionStatus !== 'loading') {
      fetchResourceMeta()
    }

    return () => {
      controller.abort()
    }
  }, [resourceId, sessionStatus])

  const isMissingResource = error === 'Resource not found'
  const shouldSignalMissingResource =
    !!onMissingResource && !loading && (isMissingResource || (!event && !error))

  useEffect(() => {
    if (shouldSignalMissingResource && onMissingResource) {
      onMissingResource()
    }
  }, [shouldSignalMissingResource, onMissingResource])

  if (loading) {
    return <ResourceContentViewSkeleton />
  }

  if (isMissingResource && onMissingResource) {
    return null
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!event) {
    if (onMissingResource) {
      return null
    }

    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Content not available</p>
      </div>
    )
  }

  const parsedEvent = parsedEventData
  if (!parsedEvent) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Content not available</p>
      </div>
    )
  }
  const title = parsedEvent.title || 'Untitled resource'
  const type = parsedEvent.type || 'document'
  const additionalLinks = parsedEvent.additionalLinks || []
  const authorName = resolvePreferredDisplayName({
    profile: authorProfile,
    preferredNames: [parsedEvent.author],
    user: resourceUser,
    pubkey: resolvedAuthorPubkey,
  })
  // Check parsedEvent.isPremium (boolean) and also check raw event tags for string 'true'
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
  const parsedPriceRaw = parsedEvent.price
  const parsedPrice = Number.isFinite(Number(parsedPriceRaw)) ? Number(parsedPriceRaw) : null
  const priceSats =
    serverPrice !== null && serverPrice !== undefined
      ? serverPrice
      : parsedPrice ?? 0
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const resourceIdIsUuid = uuidRegex.test(resourceId)
  const lockable = isPremium && resourceIdIsUuid && priceSats > 0
  const canPurchase = lockable
  const videoUrl = resolveVideoPlaybackUrl(parsedEvent.videoUrl, event.content, type)
  const videoBodyMarkdown = type === 'video' ? extractVideoBodyMarkdown(event.content) : ''

  const locked = lockable && !serverPurchased
  const courseCta = unlockedViaCourse && unlockingCourseId ? (
    <div className="flex flex-wrap gap-2 justify-end">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/courses/${unlockingCourseId}`}>
          Go to course
        </Link>
      </Button>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {showHero && (
        <ResourceMetadataHero
          event={event}
          parsedEvent={parsedEvent}
          resourceId={resourceId}
          serverPrice={serverPrice}
          serverPurchased={serverPurchased}
          unlockedViaCourse={unlockedViaCourse}
          unlockingCourseId={unlockingCourseId}
          interactionData={interactionData}
          authorName={authorName}
          authorPubkey={resolvedAuthorPubkey || event.pubkey}
          authorProfile={authorProfile}
          relayHints={routeRelayHints}
          onUnlock={handleUnlock}
          showBackLink={showBackLink}
          backHref={backHref}
          isPremium={isPremium}
          rightCtas={courseCta || undefined}
        />
      )}

      <div className="space-y-6">
        {locked ? (
          <>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <p className="text-muted-foreground">
                  This is premium content. Purchase to unlock the full video/text.
                </p>
                {canPurchase ? (
                  <Button size="lg" onClick={() => setShowPurchaseDialog(true)} className="w-full sm:w-auto">
                    Purchase for {priceSats.toLocaleString()} sats
                  </Button>
                ) : (
                  <Badge variant="outline" className="px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">
                    Purchase not available for this identifier
                  </Badge>
                )}
              </CardContent>
            </Card>
            {/* Render a dialog scoped to this CTA so clicking the button opens it */}
            <DeferredPurchaseDialog
              isOpen={showPurchaseDialog}
              onOpenChange={setShowPurchaseDialog}
              title={title}
              priceSats={priceSats}
              resourceId={resourceId}
              eventId={event.id}
              eventKind={event.kind}
              eventIdentifier={parsedEvent.d}
              eventPubkey={resolvedAuthorPubkey || event.pubkey}
              zapTarget={{
                pubkey: resolvedAuthorPubkey || event.pubkey,
                lightningAddress: authorProfile?.lud16 || undefined,
                name: authorName || parsedEvent.author || undefined,
                relayHints: routeRelayHints
              }}
              viewerZapTotalSats={viewerZapTotalSats}
              viewerZapReceipts={viewerZapReceipts}
              alreadyPurchased={serverPurchased}
              zapInsights={zapInsights}
              recentZaps={recentZaps}
              onPurchaseComplete={(purchase) => {
                const snapshot = purchase?.priceAtPurchase
                const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
                const required = Math.min(snapshotValid ? snapshot : priceSats, priceSats)
                if ((purchase?.amountPaid ?? 0) >= (required ?? 0)) {
                  handleUnlock()
                }
              }}
            />
          </>
        ) : type === 'video' ? (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <VideoPlayer
                url={videoUrl}
                content={event.content}
                title={title}
              />
              {videoBodyMarkdown && (
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer content={videoBodyMarkdown} />
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-lg max-w-none">
                <MarkdownRenderer content={event.content} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {showAdditionalLinks && (
        <AdditionalLinksCard links={additionalLinks} icon="link" />
      )}

      <div data-comments-section>
        <DeferredZapThreads
          eventDetails={{
            identifier: parsedEvent.d || resolvedIdentifier?.resolvedId || resourceId,
            pubkey: event.pubkey,
            kind: event.kind,
            relays: getRelays('default')
          }}
          title="Comments & Discussion"
        />
      </div>
    </div>
  )
}
