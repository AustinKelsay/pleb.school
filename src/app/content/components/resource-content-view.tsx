'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { type AddressData, type EventData, type NostrEvent } from 'snstr'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
import { DeferredZapThreads } from '@/components/ui/deferred-zap-threads'
import { ResourceContentViewSkeleton } from '@/app/content/components/resource-skeletons'
import { AdditionalLinksCard } from '@/components/ui/additional-links-card'
import { DeferredPurchaseDialog } from '@/components/purchase/deferred-purchase-dialog'
import { parseEvent } from '@/data/types'
import { useCommentThreads } from '@/hooks/useCommentThreads'
import { useIdleMount } from '@/hooks/useIdleMount'
import type { ZapInsights, ZapReceiptSummary } from '@/hooks/useInteractions'
import { useNostr, type NormalizedProfile } from '@/hooks/useNostr'
import { useProfileSummary } from '@/hooks/useProfileSummary'
import { extractVideoBodyMarkdown } from '@/lib/content-utils'
import { getRelays } from '@/lib/nostr-relays'
import { profileSummaryFromUser, resolvePreferredDisplayName } from '@/lib/profile-display'
import { extractRelayHintsFromDecodedData } from '@/lib/relay-hints'
import { resolveUniversalId } from '@/lib/universal-router'

import {
  fetchResourceContentInitialMeta,
  type ResourceContentInitialMeta,
} from './resource-content-meta'
import { ResourceMetadataHero } from './resource-metadata-hero'

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

const EMPTY_RESOURCE_META: ResourceContentInitialMeta = {
  resourceUser: null,
  serverPrice: null,
  serverPurchased: false,
  serverIsOwner: false,
  unlockedViaCourse: false,
  unlockingCourseId: null,
}

export interface ResourceContentViewProps {
  resourceId: string
  initialEvent?: NostrEvent | null
  initialMeta?: ResourceContentInitialMeta | null
  initialProfileSummary?: NormalizedProfile | null
  showBackLink?: boolean
  backHref?: string
  showHero?: boolean
  showAdditionalLinks?: boolean
  onMissingResource?: () => void
  viewCount?: number | null
  zapInsights?: ZapInsights
  recentZaps?: ZapReceiptSummary[]
  viewerZapTotalSats?: number
  viewerZapReceipts?: ZapReceiptSummary[]
}

/**
 * Full resource reader that can optionally reuse a prefetched event/meta payload
 * or fetch on demand when rendered inside the details route.
 */
export function ResourceContentView({
  resourceId,
  initialEvent,
  initialMeta,
  initialProfileSummary = null,
  showBackLink = false,
  backHref = `/content/${resourceId}`,
  showHero = true,
  showAdditionalLinks = true,
  onMissingResource,
  viewCount,
  zapInsights: providedZapInsights,
  recentZaps: providedRecentZaps,
  viewerZapTotalSats: providedViewerZapTotalSats,
  viewerZapReceipts: providedViewerZapReceipts,
}: ResourceContentViewProps) {
  const { fetchSingleEvent } = useNostr()
  const { data: session, status: sessionStatus } = useSession()
  const socialReady = useIdleMount()
  const [event, setEvent] = useState<NostrEvent | null>(initialEvent ?? null)
  const [loading, setLoading] = useState(!initialEvent)
  const [error, setError] = useState<string | null>(null)
  const [resourceMeta, setResourceMeta] = useState<ResourceContentInitialMeta | undefined>(
    initialMeta === undefined ? undefined : (initialMeta ?? EMPTY_RESOURCE_META)
  )
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const resolvedIdentifier = useMemo(() => resolveUniversalId(resourceId), [resourceId])
  const routeRelayHints = useMemo(
    () => extractRelayHintsFromDecodedData(resolvedIdentifier?.decodedData),
    [resolvedIdentifier?.decodedData]
  )
  const parsedEventData = useMemo(() => (event ? parseEvent(event) : null), [event])
  const isPremiumFromParsed = parsedEventData?.isPremium === true
  const isPremiumFromTags = event?.tags?.some(
    (tag) => Array.isArray(tag) && tag.length >= 2 && tag[0] === 'isPremium' && tag[1] === 'true'
  )
  const derivedPremiumFlag =
    isPremiumFromParsed ||
    isPremiumFromTags ||
    event?.kind === 30402 ||
    Boolean(parsedEventData?.price && parseFloat(parsedEventData.price) > 0)
  const parsedPriceRaw = parsedEventData?.price
  const parsedPrice = Number.isFinite(Number(parsedPriceRaw)) ? Number(parsedPriceRaw) : null
  const priceSats =
    resourceMeta?.serverPrice !== null && resourceMeta?.serverPrice !== undefined
      ? resourceMeta.serverPrice
      : parsedPrice ?? 0
  const resourceIdIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)
  const lockable = Boolean(derivedPremiumFlag) && resourceIdIsUuid && priceSats > 0
  const hasCourseAccess = Boolean(resourceMeta?.unlockedViaCourse || resourceMeta?.unlockingCourseId)
  const hasServerAccess = Boolean(
    resourceMeta?.serverPurchased || resourceMeta?.serverIsOwner || hasCourseAccess
  )
  const locked = lockable && resourceMeta !== undefined && !hasServerAccess
  const resolvedAuthorPubkey =
    parsedEventData?.authorPubkey ||
    resourceMeta?.resourceUser?.pubkey ||
    event?.pubkey ||
    null
  const seededAuthorProfile = useMemo(
    () => initialProfileSummary ?? profileSummaryFromUser(resourceMeta?.resourceUser),
    [initialProfileSummary, resourceMeta?.resourceUser]
  )
  const shouldLoadAuthorProfile =
    socialReady &&
    Boolean(resolvedAuthorPubkey) &&
    (showHero || locked || showPurchaseDialog)
  const { profile: authorProfile } = useProfileSummary(resolvedAuthorPubkey, seededAuthorProfile, {
    enabled: shouldLoadAuthorProfile,
  })
  const interactionData = useCommentThreads(event?.id, {
    enabled: showHero && socialReady && Boolean(event?.id),
    realtime: true,
    relayHints: routeRelayHints
  })
  const resolvedZapInsights = providedZapInsights ?? interactionData.zapInsights
  const resolvedRecentZaps = providedRecentZaps ?? interactionData.recentZaps
  const resolvedViewerZapTotalSats =
    providedViewerZapTotalSats ?? interactionData.viewerZapTotalSats
  const resolvedViewerZapReceipts =
    providedViewerZapReceipts ?? interactionData.viewerZapReceipts

  useEffect(() => {
    if (!initialEvent) {
      return
    }

    setEvent(initialEvent)
    setLoading(false)
    setError(null)
  }, [initialEvent])

  useEffect(() => {
    let cancelled = false

    if (initialEvent) {
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
            nostrEvent = await fetchSingleEvent(
              {
                ids: [eventData.id]
              },
              {
                relays: eventData.relays
              }
            )
          }
        } else if (resolved.idType === 'naddr' && resolved.decodedData && typeof resolved.decodedData === 'object') {
          if ('identifier' in resolved.decodedData && 'kind' in resolved.decodedData) {
            const addressData = resolved.decodedData as AddressData
            nostrEvent = await fetchSingleEvent(
              {
                kinds: [addressData.kind],
                '#d': [addressData.identifier],
                authors: addressData.pubkey ? [addressData.pubkey] : undefined
              },
              {
                relays: addressData.relays
              }
            )
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
          return
        }

        setError('Resource not found')
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

    void fetchEvent()

    return () => {
      cancelled = true
    }
  }, [fetchSingleEvent, initialEvent, resolvedIdentifier])

  useEffect(() => {
    if (initialMeta === undefined) {
      return
    }

    setResourceMeta(initialMeta ?? EMPTY_RESOURCE_META)
  }, [initialMeta, resourceId])

  useEffect(() => {
    let cancelled = false

    if (initialMeta !== undefined) {
      return () => {
        cancelled = true
      }
    }

    if (sessionStatus === 'loading') {
      setResourceMeta(undefined)
      return () => {
        cancelled = true
      }
    }

    const fetchResourceMeta = async () => {
      try {
        const nextMeta = await fetchResourceContentInitialMeta(
          resourceId,
          session?.user?.id ?? null
        )
        if (cancelled) {
          return
        }

        setResourceMeta(nextMeta ?? EMPTY_RESOURCE_META)
      } catch (error) {
        console.error('Failed to fetch resource access metadata:', error)
        if (!cancelled) {
          setResourceMeta(EMPTY_RESOURCE_META)
        }
      }
    }

    void fetchResourceMeta()

    return () => {
      cancelled = true
    }
  }, [initialMeta, resourceId, session?.user?.id, sessionStatus])

  const handleUnlock = () => {
    setResourceMeta((current) => ({
      ...(current ?? EMPTY_RESOURCE_META),
      serverPurchased: true,
    }))
  }

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
    user: resourceMeta?.resourceUser,
    pubkey: resolvedAuthorPubkey,
  })
  const isPremium = Boolean(derivedPremiumFlag)
  const isAccessMetaLoading = lockable && resourceMeta === undefined
  const canPurchase = lockable && !hasServerAccess
  const videoUrl = resolveVideoPlaybackUrl(parsedEvent.videoUrl, event.content, type)
  const videoBodyMarkdown = type === 'video' ? extractVideoBodyMarkdown(event.content) : ''
  const courseCta = hasCourseAccess && resourceMeta?.unlockingCourseId ? (
    <div className="flex flex-wrap gap-2 justify-end">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/courses/${resourceMeta.unlockingCourseId}`}>
          Go to course
        </Link>
      </Button>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {showHero ? (
        <ResourceMetadataHero
          event={event}
          parsedEvent={parsedEvent}
          resourceId={resourceId}
          serverPrice={resourceMeta?.serverPrice ?? null}
          serverPurchased={resourceMeta?.serverPurchased ?? false}
          serverIsOwner={resourceMeta?.serverIsOwner ?? false}
          unlockedViaCourse={resourceMeta?.unlockedViaCourse ?? false}
          interactionData={interactionData}
          authorName={authorName}
          authorPubkey={resolvedAuthorPubkey || event.pubkey}
          authorProfile={authorProfile}
          relayHints={routeRelayHints}
          onUnlock={handleUnlock}
          showBackLink={showBackLink}
          backHref={backHref}
          isPremium={isPremium}
          hidePrimaryCta={isAccessMetaLoading}
          rightCtas={courseCta || undefined}
          showSocialMetrics={socialReady}
          viewCount={viewCount}
        />
      ) : null}

      <div className="space-y-6">
        {isAccessMetaLoading ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-muted-foreground">
                Checking access...
              </p>
            </CardContent>
          </Card>
        ) : locked ? (
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
              viewerZapTotalSats={resolvedViewerZapTotalSats}
              viewerZapReceipts={resolvedViewerZapReceipts}
              alreadyPurchased={hasServerAccess}
              zapInsights={resolvedZapInsights}
              recentZaps={resolvedRecentZaps}
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
              {videoBodyMarkdown ? (
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer content={videoBodyMarkdown} />
                </div>
              ) : null}
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

      {showAdditionalLinks ? (
        <AdditionalLinksCard links={additionalLinks} icon="link" />
      ) : null}

      <div data-comments-section>
        <DeferredZapThreads
          eventDetails={{
            identifier: parsedEvent.d || resolvedIdentifier?.resolvedId || resourceId,
            pubkey: event.pubkey,
            kind: event.kind,
            relays: routeRelayHints.length > 0 ? routeRelayHints : getRelays('default')
          }}
          title="Comments & Discussion"
        />
      </div>
    </div>
  )
}
