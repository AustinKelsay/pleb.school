'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Tag,
  Video
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { type AddressData, type NostrEvent } from 'snstr'

import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { DeferredPurchaseDialog } from '@/components/purchase/deferred-purchase-dialog'
import { ResourceContentView } from '@/app/content/components/resource-content-view'
import { AdditionalLinksCard } from '@/components/ui/additional-links-card'
import { Badge } from '@/components/ui/badge'
import { SidebarToggle } from '@/components/ui/sidebar-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpandableText } from '@/components/ui/expandable-text'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ViewsText } from '@/components/ui/views-text'
import { DeferredZapThreads } from '@/components/ui/deferred-zap-threads'
import { ResourcePageSkeleton } from '@/app/content/components/resource-skeletons'
import { parseEvent } from '@/data/types'
import {
  fetchResourceContentInitialMeta,
  isUuidResourceId,
  type ResourceContentInitialMeta,
} from '@/app/content/components/resource-content-meta'
import { useInteractions } from '@/hooks/useInteractions'
import { useIdleMount } from '@/hooks/useIdleMount'
import { useNostr } from '@/hooks/useNostr'
import { useProfileSummary } from '@/hooks/useProfileSummary'
import { useViews } from '@/hooks/useViews'
import { trackEventSafe } from '@/lib/analytics'
import { extractNoteId } from '@/lib/nostr-events'
import { formatNoteIdentifier } from '@/lib/note-identifiers'
import { fetchResourceEventOnClient } from '@/lib/resource-event-resolution'
import { getRelays } from '@/lib/nostr-relays'
import { profileSummaryFromUser, resolvePreferredDisplayName } from '@/lib/profile-display'
import { extractRelayHintsFromDecodedData } from '@/lib/relay-hints'
import { resolveUniversalId, type UniversalIdResult } from '@/lib/universal-router'

interface ResourcePageClientProps {
  resourceId: string
  initialEvent: NostrEvent | null
  initialMeta: ResourceContentInitialMeta | null
}

/**
 * Resource overview component - shows metadata and description, not the actual content
 */
function ResourceOverview({ resourceId, contentHref }: { resourceId: string; contentHref: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5" />
            <span>About this Resource</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground mb-2">
              Ready to dive into the content?
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Click below to access the full resource content.
            </p>
            <Button size="lg" asChild>
              <Link
                href={contentHref}
                onClick={() => {
                  trackEventSafe("resource_preview_view_content_clicked", {
                    resource_id: resourceId,
                  })
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Content
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Main resource page component
 */
function ResourcePageContent({
  resourceId,
  initialEvent,
  initialMeta,
}: {
  resourceId: string
  initialEvent: NostrEvent | null
  initialMeta: ResourceContentInitialMeta | null
}) {
  const { fetchSingleEvent } = useNostr()
  const { data: session, status: sessionStatus } = useSession()
  const socialReady = useIdleMount({ timeoutMs: 1200 })
  const { count: viewCount } = useViews({
    ns: 'content',
    id: resourceId,
    enabled: socialReady
  })
  const [event, setEvent] = useState<NostrEvent | null>(initialEvent)
  const [resourceMeta, setResourceMeta] = useState<ResourceContentInitialMeta | null | undefined>(
    initialMeta
  )
  const [loading, setLoading] = useState(!initialEvent)
  const [error, setError] = useState<string | null>(null)
  const [idResult, setIdResult] = useState<UniversalIdResult | null>(() => resolveUniversalId(resourceId))
  const [purchaseStatusOverride, setPurchaseStatusOverride] = useState<boolean | null>(null)
  const [isPurchaseStatusLoading, setIsPurchaseStatusLoading] = useState(initialMeta === undefined)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [isFullWidth, setIsFullWidth] = useState(false)
  const trackedResourceDetailViewRef = useRef<Set<string>>(new Set())

  const handlePurchaseDialogChange = (open: boolean) => {
    if (open) {
      trackEventSafe("resource_purchase_dialog_opened", {
        resource_id: resourceId,
        event_id: event?.id,
      })
    }
    setShowPurchaseDialog(open)
  }

  const handleSidebarToggle = () => {
    const nextValue = !isFullWidth
    trackEventSafe("resource_full_width_toggled", {
      resource_id: resourceId,
      enabled: nextValue,
    })
    setIsFullWidth(nextValue)
  }

  const eventATag = useMemo(() => {
    if (!event || !event.kind || event.kind < 30000) return undefined
    const identifier = extractNoteId(event)
    if (!identifier) return undefined
    return `${event.kind}:${event.pubkey}:${identifier}`
  }, [event])

  const routeRelayHints = useMemo(
    () => extractRelayHintsFromDecodedData(idResult?.decodedData),
    [idResult?.decodedData]
  )
  const fallbackNoteId = resourceMeta?.resourceNoteId ?? initialMeta?.resourceNoteId ?? null
  const initialAuthorProfile = useMemo(
    () => profileSummaryFromUser(resourceMeta?.resourceUser),
    [resourceMeta?.resourceUser]
  )
  const { profile: authorProfile } = useProfileSummary(event?.pubkey, initialAuthorProfile, {
    enabled: socialReady && Boolean(event?.pubkey),
  })
  
  // Get real interaction data from Nostr - call hook unconditionally at top level
    const {
      interactions,
      isLoadingZaps,
      isLoadingLikes,
    isLoadingComments,
    hasReacted,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats,
    viewerZapReceipts
  } = useInteractions({
    eventId: event?.id,
    eventATag,
    realtime: true,
    relayHints: routeRelayHints,
    staleTime: 5 * 60 * 1000,
    enabled: socialReady && Boolean(event?.id)
  })

  useEffect(() => {
    setEvent(initialEvent)
    setLoading(!initialEvent)
    setError(null)
  }, [initialEvent, resourceId])

  useEffect(() => {
    setResourceMeta(initialMeta)
    setIsPurchaseStatusLoading(initialMeta === undefined)
  }, [initialMeta, resourceId])

  useEffect(() => {
    let isCancelled = false

    const fetchEvent = async () => {
      try {
        if (!isCancelled) {
          setLoading(true)
          setError(null)
        }
        
        const lookup = await fetchResourceEventOnClient(resourceId, fetchSingleEvent, fallbackNoteId)
        if (!isCancelled) {
          setIdResult(lookup.resolved)
        }

        if (lookup.event) {
          if (!isCancelled) {
            setEvent(lookup.event)
          }
        } else {
          if (!isCancelled) {
            setError(lookup.error ?? 'Resource not found')
          }
        }
      } catch (err) {
        console.error('Error fetching Nostr event:', err)
        if (!isCancelled) {
          setError('Failed to fetch resource')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    if (resourceId && !event) {
      void fetchEvent()
    }

    return () => {
      isCancelled = true
    }
  }, [resourceId, fetchSingleEvent, fallbackNoteId, event])

  useEffect(() => {
    let isCancelled = false

    if (initialMeta !== undefined) {
      setResourceMeta(initialMeta)
      setIsPurchaseStatusLoading(false)
      return () => {
        isCancelled = true
      }
    }

    if (!isUuidResourceId(resourceId)) {
      setResourceMeta(null)
      setIsPurchaseStatusLoading(false)
      return () => {
        isCancelled = true
      }
    }

    if (sessionStatus === 'loading') {
      setResourceMeta(undefined)
      setIsPurchaseStatusLoading(true)
      return () => {
        isCancelled = true
      }
    }

    const fetchResourceMeta = async () => {
      setIsPurchaseStatusLoading(true)
      try {
        const nextMeta = await fetchResourceContentInitialMeta(
          resourceId,
          session?.user?.id ?? null
        )
        if (isCancelled) {
          return
        }

        setResourceMeta(nextMeta)
      } catch (error) {
        console.error('Failed to fetch resource access metadata:', error)
        if (!isCancelled) {
          setResourceMeta(null)
        }
      } finally {
        if (!isCancelled) {
          setIsPurchaseStatusLoading(false)
        }
      }
    }

    void fetchResourceMeta()

    return () => {
      isCancelled = true
    }
  }, [resourceId, session?.user?.id, sessionStatus, initialMeta])

  useEffect(() => {
    setPurchaseStatusOverride(null)
  }, [resourceId, sessionStatus])

  useEffect(() => {
    if (!event) return
    const viewKey = event.id
    if (trackedResourceDetailViewRef.current.has(viewKey)) {
      return
    }
    trackedResourceDetailViewRef.current.add(viewKey)
    trackEventSafe("resource_detail_viewed", {
      resource_id: resourceId,
      event_id: event.id,
      event_kind: event.kind,
    })
  }, [resourceId, event])

  if (loading) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <ResourcePageSkeleton />
        </Section>
      </MainLayout>
    )
  }

  if (error || !event) {
    notFound()
  }

  const parsedEvent = parseEvent(event)
  const title = parsedEvent.title || 'Untitled resource'
  const description = parsedEvent.summary || ''
  const topics = parsedEvent.topics || []
  const additionalLinks = parsedEvent.additionalLinks || []
  const image = parsedEvent.image || '/placeholder.svg'
  const resourceUser = resourceMeta?.resourceUser ?? null
  const serverPrice = resourceMeta?.serverPrice ?? null
  const serverIsOwner = resourceMeta?.serverIsOwner ?? false
  const unlockedViaCourse = resourceMeta?.unlockedViaCourse ?? false
  const unlockingCourseId = resourceMeta?.unlockingCourseId ?? null
  const serverPurchased = purchaseStatusOverride ?? (resourceMeta?.serverPurchased ?? false)
  const hasCourseAccess = unlockedViaCourse || Boolean(unlockingCourseId)
  const hasServerAccess = serverPurchased || serverIsOwner || hasCourseAccess
  const author = resolvePreferredDisplayName({
    profile: authorProfile,
    preferredNames: [parsedEvent.author],
    user: resourceUser,
    pubkey: event.pubkey,
  })
  const type = parsedEvent.type || 'document'
  // Views are tracked via /api/views and Vercel KV
  const isCourseContent = idResult?.contentType === 'course' || event.kind === 30004
  // Mirror the premium logic from ResourceContentView so gating stays consistent.
  const isPremiumFromParsed = parsedEvent.isPremium === true
  const isPremiumFromTags = event.tags?.some(
    (tag) => Array.isArray(tag) && tag.length >= 2 && tag[0] === 'isPremium' && tag[1] === 'true'
  )
  const derivedPremiumFlag =
    isPremiumFromParsed ||
    isPremiumFromTags ||
    event.kind === 30402 ||
    Boolean(parsedEvent.price && Number(parsedEvent.price) > 0)
  const isPaidResource = Boolean(derivedPremiumFlag)
  // Only courses and paid resources keep the preview wall; everything else opens directly.
  const requiresPreviewGate = isCourseContent || isPaidResource
  const nostrIdentifier = formatNoteIdentifier(event, resourceId)
  const nostrUrl = nostrIdentifier ? `https://njump.me/${nostrIdentifier}` : null
  
  // Use only real interaction data - no fallbacks
  const zapsCount = interactions.zaps
  const commentsCount = interactions.comments
  const reactionsCount = interactions.likes
  const parsedPriceRaw = parsedEvent.price
  const parsedPrice = Number.isFinite(Number(parsedPriceRaw)) ? Number(parsedPriceRaw) : null
  const priceSats =
    serverPrice !== null && serverPrice !== undefined
      ? serverPrice
      : parsedPrice ?? 0
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const resourceIdIsUuid = uuidRegex.test(resourceId)
  const canPurchase = resourceIdIsUuid && isPaidResource && priceSats > 0 && !hasServerAccess
  const courseAccessCta = hasCourseAccess && unlockingCourseId ? (
    <div className="flex flex-wrap gap-2 items-center">
      <Badge variant="outline" className="border-success/60 text-success bg-success/10">
        Access via course
      </Badge>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/courses/${unlockingCourseId}`}>
          Go to course
        </Link>
      </Button>
    </div>
  ) : null

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getResourceTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-5 w-5" />
      default:
        return <FileText className="h-5 w-5" />
    }
  }

  // Normalize resourceId to extract the raw d-tag value for ZapThreads
  // ZapThreads expects the d-tag identifier, not encoded formats (naddr, nevent, note, hex)
  let normalizedResourceId: string = resourceId
  
  if (idResult) {
    // For naddr, extract the identifier (d-tag) from decoded data
    if (idResult.idType === 'naddr' && idResult.decodedData) {
      const addressData = idResult.decodedData as AddressData
      if (addressData.identifier) {
        normalizedResourceId = addressData.identifier
      }
    } else if (idResult.idType === 'nevent' || idResult.idType === 'note' || idResult.idType === 'hex') {
      // For nevent/note/hex, extract d-tag from the event itself
      // Parameterized replaceable events (30023, 30402, 30004) use d-tags
      const dTag = extractNoteId(event)
      if (dTag) {
        normalizedResourceId = dTag
      } else {
        // Fallback to resolvedId if no d-tag found
        normalizedResourceId = idResult.resolvedId
      }
    } else {
      // For other types (database IDs, etc.), use resolvedId
      normalizedResourceId = idResult.resolvedId
    }
  } else {
    // If idResult is null, try to extract d-tag from event as fallback
    const dTag = extractNoteId(event)
    if (dTag) {
      normalizedResourceId = dTag
    }
  }
  const contentRouteId = isCourseContent ? normalizedResourceId : resourceId
  const contentHref = isCourseContent
    ? `/courses/${contentRouteId}`
    : `/content/${resourceId}/details`

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-8">
          {/* Resource Header */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {topics[0] || 'general'}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {type}
                  </Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{title}</h1>
                {description && (
                  <ExpandableText
                    text={description}
                    textClassName="text-lg text-muted-foreground"
                  />
                )}
              </div>

              {socialReady ? (
                <div className="flex items-center flex-wrap gap-4 sm:gap-6">
                  <InteractionMetrics
                    zapsCount={zapsCount}
                    commentsCount={commentsCount}
                    likesCount={reactionsCount}
                    isLoadingZaps={isLoadingZaps}
                    isLoadingComments={isLoadingComments}
                    isLoadingLikes={isLoadingLikes}
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
                      pubkey: event.pubkey,
                      lightningAddress: authorProfile?.lud16 || undefined,
                      name: author,
                      relayHints: routeRelayHints
                    }}
                  />

                  <div className="flex items-center space-x-1.5 sm:space-x-2">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                    <ViewsText ns="content" id={resourceId} count={viewCount} />
                  </div>
                </div>
              ) : null}

              {requiresPreviewGate && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                  {isPurchaseStatusLoading ? (
                    <Button size="lg" className="w-full sm:w-auto" disabled aria-busy={true}>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking access...
                    </Button>
                  ) : canPurchase && !hasServerAccess ? (
                    <Button
                      size="lg"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        trackEventSafe("resource_purchase_cta_clicked", {
                          resource_id: resourceId,
                          price_sats: priceSats,
                          event_id: event.id,
                        })
                        handlePurchaseDialogChange(true)
                      }}
                    >
                      Purchase for {priceSats.toLocaleString()} sats
                    </Button>
                  ) : (
                    <>
                      <Button size="lg" className="bg-primary hover:bg-primary/90 w-full sm:w-auto" asChild>
                        <Link
                          href={contentHref}
                          onClick={() => {
                            trackEventSafe("resource_view_content_clicked", {
                              resource_id: resourceId,
                              event_id: event.id,
                              event_kind: event.kind,
                              source: "hero_cta",
                            })
                          }}
                        >
                          {getResourceTypeIcon(type)}
                          <span className="ml-2">
                            {type === 'video' ? 'Watch Now' : hasServerAccess ? 'View Content' : 'Read Now'}
                          </span>
                        </Link>
                      </Button>
                      {serverPurchased && (
                        <Badge variant="outline" className="px-3 py-1 bg-success/10 border-success/50 text-success">
                          Purchased for {priceSats.toLocaleString()} sats
                        </Badge>
                      )}
                      {!canPurchase && isPaidResource && !hasServerAccess && (
                        <Badge variant="outline" className="px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">
                          Purchase unavailable for this identifier
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              )}

              {requiresPreviewGate && hasServerAccess && courseAccessCta}

              {canPurchase && (
                <DeferredPurchaseDialog
                  isOpen={showPurchaseDialog}
                  onOpenChange={handlePurchaseDialogChange}
                  title={title}
                  priceSats={priceSats}
                  resourceId={resourceId}
                  eventId={event.id}
                  eventKind={event.kind}
                  eventIdentifier={parsedEvent.d}
                  eventPubkey={event.pubkey}
                  zapTarget={{
                    pubkey: event.pubkey,
                    lightningAddress: authorProfile?.lud16 || undefined,
                    name: author,
                    relayHints: routeRelayHints
                  }}
                  viewerZapTotalSats={viewerZapTotalSats}
                  alreadyPurchased={hasServerAccess}
                  zapInsights={zapInsights}
                  recentZaps={recentZaps}
                  viewerZapReceipts={viewerZapReceipts}
                  onPurchaseComplete={(purchase) => {
                    const snapshot = purchase?.priceAtPurchase
                    const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
                    const required = Math.min(snapshotValid ? snapshot : priceSats, priceSats)
                    if ((purchase?.amountPaid ?? 0) >= (required ?? 0)) {
                      trackEventSafe("resource_purchase_unlocked", {
                        resource_id: resourceId,
                        amount_paid_sats: purchase?.amountPaid ?? 0,
                        price_sats: priceSats,
                      })
                      setPurchaseStatusOverride(true)
                    }
                  }}
                />
              )}

              {/* Tags */}
              {topics && topics.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center">
                    <Tag className="h-4 w-4 mr-2" />
                    Topics
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
                {/* Background pattern for visual interest */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div 
                    className="absolute inset-0" 
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
                      backgroundSize: '20px 20px'
                    } as React.CSSProperties}
                  />
                </div>
                
                {image && image !== '/placeholder.svg' ? (
                  <OptimizedImage 
                    src={image} 
                    alt={title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                        {getResourceTypeIcon(type)}
                      </div>
                      <p className="text-lg font-medium text-foreground">
                        {type === 'video' ? 'Video Preview' : 'Resource Preview'}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">{type} • {topics[0] || 'general'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resource Content - Conditionally render preview or full content */}
          {!requiresPreviewGate && courseAccessCta && (
            <div className="flex justify-end">{courseAccessCta}</div>
          )}

          <div className={`grid grid-cols-1 gap-6 transition-all duration-300 ease-out ${isFullWidth ? 'lg:grid-cols-[minmax(0,1fr)_3.25rem]' : 'lg:grid-cols-[minmax(0,1fr)_22rem]'}`}>
            <div className="transition-all duration-300 ease-out">
              {requiresPreviewGate ? (
                <ResourceOverview resourceId={resourceId} contentHref={contentHref} />
              ) : (
                <ResourceContentView 
                  resourceId={resourceId} 
                  initialEvent={event} 
                  initialMeta={
                    resourceMeta === undefined
                      ? undefined
                      : {
                          ...(resourceMeta ?? {
                            resourceUser: null,
                            serverPrice: null,
                            serverPurchased: false,
                            serverIsOwner: false,
                            unlockedViaCourse: false,
                            unlockingCourseId: null,
                            resourceNoteId: null,
                          }),
                          serverPurchased,
                        }
                  }
                  initialProfileSummary={authorProfile ?? initialAuthorProfile}
                  showBackLink={false}
                  showHero={false}
                  showAdditionalLinks={false}
                  viewCount={viewCount}
                  zapInsights={zapInsights}
                  recentZaps={recentZaps}
                  viewerZapTotalSats={viewerZapTotalSats}
                  viewerZapReceipts={viewerZapReceipts}
                />
              )}
            </div>

            <aside className="transition-all duration-300 ease-out">
              <div className={`hidden ${isFullWidth ? 'lg:flex lg:justify-center lg:pt-3' : ''}`}>
                <SidebarToggle isCollapsed onToggle={handleSidebarToggle} />
              </div>
              <div className={`space-y-6 ${isFullWidth ? 'block lg:hidden' : 'block'}`}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>About this {type}</CardTitle>
                      <SidebarToggle isCollapsed={false} onToggle={handleSidebarToggle} className="hidden lg:inline-flex" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Author</h4>
                      <p className="text-sm text-muted-foreground">{author}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Type</h4>
                      <p className="text-sm text-muted-foreground capitalize">{type}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Category</h4>
                      <p className="text-sm text-muted-foreground capitalize">{topics[0] || 'general'}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Views</h4>
                      <p className="text-sm text-muted-foreground">
                        {socialReady ? (
                          <ViewsText ns="content" id={resourceId} label={false} count={viewCount} />
                        ) : '...'}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Created</h4>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                    {nostrUrl && (
                      <div>
                        <Button variant="outline" className="w-full justify-center" asChild>
                          <a
                            href={nostrUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              trackEventSafe("resource_nostr_link_clicked", {
                                resource_id: resourceId,
                                event_id: event.id,
                              })
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open on Nostr
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <AdditionalLinksCard links={additionalLinks} layout="stack" />
              </div>
            </aside>
          </div>
          
          {/* Comments Section - Only show for preview-gated content since ResourceContentView includes its own comments */}
          {requiresPreviewGate && (
            <div className="mt-8" data-comments-section>
              <DeferredZapThreads
                eventDetails={{
                  identifier: normalizedResourceId,
                  pubkey: event.pubkey,
                  kind: event.kind,
                  relays: routeRelayHints.length > 0 ? routeRelayHints : getRelays('default')
                }}
                title="Comments"
              />
            </div>
          )}
        </div>
      </Section>
    </MainLayout>
  )
}

export default function ResourcePageClient({
  resourceId,
  initialEvent,
  initialMeta,
}: ResourcePageClientProps) {
  return (
    <ResourcePageContent
      resourceId={resourceId}
      initialEvent={initialEvent}
      initialMeta={initialMeta}
    />
  )
}
