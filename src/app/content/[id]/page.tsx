'use client'

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import { type AddressData, type EventData, type NostrEvent } from 'snstr'

import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { DeferredPurchaseDialog } from '@/components/purchase/deferred-purchase-dialog'
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
import { ResourceContentView } from '@/app/content/components/resource-content-view'
import { ResourcePageSkeleton, ResourceOverviewCardSkeleton } from '@/app/content/components/resource-skeletons'
import { parseEvent, type CourseUser } from '@/data/types'
import { useInteractions } from '@/hooks/useInteractions'
import { useNostr } from '@/hooks/useNostr'
import { useProfileSummary } from '@/hooks/useProfileSummary'
import { trackEventSafe } from '@/lib/analytics'
import { extractNoteId } from '@/lib/nostr-events'
import { formatNoteIdentifier } from '@/lib/note-identifiers'
import { getRelays } from '@/lib/nostr-relays'
import { profileSummaryFromUser, resolvePreferredDisplayName } from '@/lib/profile-display'
import { extractRelayHintsFromDecodedData } from '@/lib/relay-hints'
import { resolveUniversalId, type UniversalIdResult } from '@/lib/universal-router'

interface ResourcePageProps {
  params: Promise<{
    id: string
  }>
}

/**
 * Loading component for resource content (reuses the proper skeleton)
 */
function ResourceContentSkeleton() {
  return <ResourceOverviewCardSkeleton />
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
function ResourcePageContent({ resourceId }: { resourceId: string }) {
  const { fetchSingleEvent } = useNostr()
  const { status: sessionStatus } = useSession()
  const [event, setEvent] = useState<NostrEvent | null>(null)
  const [resourceUser, setResourceUser] = useState<CourseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [idResult, setIdResult] = useState<UniversalIdResult | null>(null)
  const [serverPrice, setServerPrice] = useState<number | null>(null)
  const [serverPurchased, setServerPurchased] = useState<boolean>(false)
  const [unlockedViaCourse, setUnlockedViaCourse] = useState<boolean>(false)
  const [unlockingCourseId, setUnlockingCourseId] = useState<string | null>(null)
  const [isPurchaseStatusLoading, setIsPurchaseStatusLoading] = useState(true)
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
  const initialAuthorProfile = useMemo(
    () => profileSummaryFromUser(resourceUser),
    [resourceUser]
  )
  const { profile: authorProfile } = useProfileSummary(event?.pubkey, initialAuthorProfile, {
    enabled: Boolean(event?.pubkey),
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
    staleTime: 5 * 60 * 1000 // Use staleTime instead of cacheDuration
  })

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Resolve the universal ID to determine how to fetch the content
        const resolved = resolveUniversalId(resourceId)
        if (!resolved) {
          setIdResult(null)
          setError('Unsupported identifier')
          setLoading(false)
          return
        }
        setIdResult(resolved)
        
        let nostrEvent: NostrEvent | null = null
        
        // Fetch based on ID type
        if (resolved.idType === 'nevent' && resolved.decodedData) {
          if (
            typeof resolved.decodedData === 'object' &&
            'id' in resolved.decodedData &&
            typeof resolved.decodedData.id === 'string'
          ) {
            const data = resolved.decodedData as EventData
            // Check if relays field exists and is a valid array of strings
            const relayHints = data.relays && Array.isArray(data.relays) && data.relays.length > 0
              ? data.relays.filter((relay): relay is string => typeof relay === 'string')
              : undefined
            
            nostrEvent = await fetchSingleEvent({
              ids: [data.id]
            }, relayHints ? { relays: relayHints } : {})
          } else {
            console.error('Invalid nevent decoded data', resolved.decodedData)
            setError('Invalid identifier metadata')
            setLoading(false)
            return
          }
        } else if (resolved.idType === 'naddr' && resolved.decodedData) {
          if (
            typeof resolved.decodedData === 'object' &&
            'identifier' in resolved.decodedData &&
            'kind' in resolved.decodedData &&
            typeof resolved.decodedData.identifier === 'string' &&
            typeof resolved.decodedData.kind === 'number'
          ) {
            const data = resolved.decodedData as AddressData
            // Check if relays field exists and is a valid array of strings
            const relayHints = data.relays && Array.isArray(data.relays) && data.relays.length > 0
              ? data.relays.filter((relay): relay is string => typeof relay === 'string')
              : undefined
            
            nostrEvent = await fetchSingleEvent({
              kinds: [data.kind],
              '#d': [data.identifier],
              authors: data.pubkey ? [data.pubkey] : undefined
            }, relayHints ? { relays: relayHints } : {})
          } else {
            console.error('Invalid naddr decoded data', resolved.decodedData)
            setError('Invalid identifier metadata')
            setLoading(false)
            return
          }
        } else if (resolved.idType === 'note' || resolved.idType === 'hex') {
          // Direct event ID
          nostrEvent = await fetchSingleEvent({
            ids: [resolved.resolvedId]
          })
        } else {
          // Database ID or other format - try as identifier
          nostrEvent = await fetchSingleEvent({
            kinds: [30023, 30402, 30403], // Long-form content, paid content, and drafts
            '#d': [resolved.resolvedId]
          })
        }
        
        if (nostrEvent) {
          setEvent(nostrEvent)
        } else {
          setError('Resource not found')
        }
      } catch (err) {
        console.error('Error fetching Nostr event:', err)
        setError('Failed to fetch resource')
      } finally {
        setLoading(false)
      }
    }

    if (resourceId) {
      fetchEvent()
    }
  }, [resourceId, fetchSingleEvent])

  useEffect(() => {
    let isCancelled = false

    const fetchResourceMeta = async () => {
      const resetResourceMeta = () => {
        if (isCancelled) return
        setResourceUser(null)
        setServerPrice(null)
        setServerPurchased(false)
        setUnlockedViaCourse(false)
        setUnlockingCourseId(null)
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(resourceId)) {
        resetResourceMeta()
        setIsPurchaseStatusLoading(false)
        return
      }

      if (sessionStatus === 'loading') {
        resetResourceMeta()
        return
      }

      resetResourceMeta()
      setIsPurchaseStatusLoading(true)
      try {
        const res = await fetch(`/api/resources/${resourceId}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          resetResourceMeta()
          return
        }
        const body = await res.json()
        const data = body?.data
        if (!isCancelled) {
          setResourceUser(data?.user ?? null)
        }
        if (typeof data?.price === 'number' && !isCancelled) {
          setServerPrice(data.price)
        }
        if (!isCancelled) {
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
          setServerPurchased(unlockedByPurchase || unlockedByCourse)
          setUnlockedViaCourse(unlockedByCourse)
          setUnlockingCourseId(data?.unlockingCourseId || null)
        }
      } catch (err) {
        resetResourceMeta()
        console.error('Failed to fetch resource meta', err)
      } finally {
        if (!isCancelled) {
          setIsPurchaseStatusLoading(false)
        }
      }
    }

    fetchResourceMeta()

    return () => {
      // Prevent state updates if the component unmounts mid-request
      // (e.g., during fast navigation between resources).
      isCancelled = true
    }
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
  const canPurchase = resourceIdIsUuid && isPaidResource && priceSats > 0
  const courseAccessCta = unlockedViaCourse && unlockingCourseId ? (
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
                  <ViewsText ns="content" id={resourceId} />
                </div>
                
              </div>

              {requiresPreviewGate && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                  {isPurchaseStatusLoading ? (
                    <Button size="lg" className="w-full sm:w-auto" disabled aria-busy={true}>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking access...
                    </Button>
                  ) : canPurchase && !serverPurchased ? (
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
                            {type === 'video' ? 'Watch Now' : serverPurchased ? 'View Content' : 'Read Now'}
                          </span>
                        </Link>
                      </Button>
                      {serverPurchased && (
                        <Badge variant="outline" className="px-3 py-1 bg-success/10 border-success/50 text-success">
                          Purchased for {priceSats.toLocaleString()} sats
                        </Badge>
                      )}
                      {!canPurchase && isPaidResource && !serverPurchased && (
                        <Badge variant="outline" className="px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">
                          Purchase unavailable for this identifier
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              )}

              {requiresPreviewGate && serverPurchased && courseAccessCta}

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
                  alreadyPurchased={serverPurchased}
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
                      setServerPurchased(true)
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
                <Suspense fallback={<ResourceContentSkeleton />}>
                  <ResourceOverview resourceId={resourceId} contentHref={contentHref} />
                </Suspense>
              ) : (
                <ResourceContentView 
                  resourceId={resourceId} 
                  initialEvent={event} 
                  initialProfileSummary={authorProfile ?? initialAuthorProfile}
                  showBackLink={false}
                  showHero={false}
                  showAdditionalLinks={false}
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
                        <ViewsText ns="content" id={resourceId} label={false} />
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
                  relays: getRelays('default')
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

/**
 * Resource detail page with dynamic routing
 */
export default function ResourcePage({ params }: ResourcePageProps) {
  const [resourceId, setResourceId] = useState<string>('')

  useEffect(() => {
    params.then(p => setResourceId(p.id))
  }, [params])

  if (!resourceId) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <ResourcePageSkeleton />
        </Section>
      </MainLayout>
    )
  }

  return <ResourcePageContent resourceId={resourceId} />
} 
