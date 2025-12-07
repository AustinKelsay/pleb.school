'use client'

import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { getInteractionIcon } from '@/lib/payments-config'
import { createEvent, getEventHash, getPublicKey, signEvent, type NostrEvent } from 'snstr'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useSnstrContext } from '@/contexts/snstr-context'
import { DEFAULT_ZAP_INSIGHTS, type ZapInsights, type ZapReceiptSummary } from '@/hooks/useInteractions'
import { isNip07User } from '@/lib/nostr-events'
import { normalizeHexPrivkey, normalizeHexPubkey } from '@/lib/nostr-keys'
import { useZapSender } from '@/hooks/useZapSender'
import { ZapDialog } from '@/components/zap/zap-dialog'
import type { LightningRecipient } from '@/types/zap'

// Configurable interaction icons from config/payments.json (resolved at module scope)
const ZapIcon = getInteractionIcon('zap')
const CommentIcon = getInteractionIcon('comment')
const HeartIcon = getInteractionIcon('heart')

function buildReactionTags(
  eventId: string,
  eventPubkey?: string,
  eventKind?: number,
  eventIdentifier?: string
): string[][] {
  const tags: string[][] = [['e', eventId]]
  if (eventPubkey) {
    tags.push(['p', eventPubkey])
  }
  if (eventKind && eventKind >= 30000 && eventIdentifier && eventPubkey) {
    const normalizedPubkey = eventPubkey.toLowerCase()
    tags.push(['a', `${eventKind}:${normalizedPubkey}:${eventIdentifier}`])
  }
  return tags
}

function createUnsignedReaction(pubkey: string, tags: string[][]): Omit<NostrEvent, 'id' | 'sig'> {
  return createEvent(
    {
      kind: 7,
      content: '+',
      tags,
      created_at: Math.floor(Date.now() / 1000)
    },
    pubkey
  )
}

interface InteractionMetricsProps {
  /** Number of zaps */
  zapsCount: number
  /** Number of comments */
  commentsCount: number
  /** Number of likes/reactions */
  likesCount: number
  /** Loading state for zaps */
  isLoadingZaps?: boolean
  /** Loading state for comments */
  isLoadingComments?: boolean
  /** Loading state for likes */
  isLoadingLikes?: boolean
  /** Additional className for the container */
  className?: string
  /** Whether to show the interactions in a compact layout */
  compact?: boolean
  /** Whether the current viewer already reacted */
  hasReacted?: boolean
  /** Reaction target: event id */
  eventId?: string
  /** Reaction target kind (used for parameterized events) */
  eventKind?: number
  /** Reaction target author pubkey */
  eventPubkey?: string
  /** Reaction target identifier ("d" tag) */
  eventIdentifier?: string
  /** Lightning recipient + invoice hints */
  zapTarget?: LightningRecipient
  /** Aggregated zap stats */
  zapInsights?: ZapInsights
  /** Preview of recent zap receipts */
  recentZaps?: ZapReceiptSummary[]
  /** Whether the current viewer has already zapped */
  hasZappedWithLightning?: boolean
  /** Total sats the viewer has contributed to this event */
  viewerZapTotalSats?: number
}

/**
 * Reusable component for displaying interaction metrics (zaps, comments, likes)
 * Adds Nostr (kind 7) reaction publishing powered by snstr
 */
export function InteractionMetrics({
  zapsCount,
  commentsCount,
  likesCount,
  isLoadingZaps = false,
  isLoadingComments = false,
  isLoadingLikes = false,
  className = '',
  compact = false,
  hasReacted = false,
  eventId,
  eventKind,
  eventPubkey,
  eventIdentifier,
  zapTarget,
  zapInsights = DEFAULT_ZAP_INSIGHTS,
  recentZaps = [],
  hasZappedWithLightning = false,
  viewerZapTotalSats = 0
}: InteractionMetricsProps) {
  const { data: session, status: sessionStatus } = useSession()
  const { toast } = useToast()
  const { publish } = useSnstrContext()
  const [isReacting, setIsReacting] = useState(false)
  const [optimisticReaction, setOptimisticReaction] = useState(false)
  const [isZapDialogOpen, setIsZapDialogOpen] = useState(false)
  const [preferAnonymousZap, setPreferAnonymousZap] = useState(false)
  const normalizedSessionPubkey = normalizeHexPubkey(session?.user?.pubkey)
  const normalizedSessionPrivkey = normalizeHexPrivkey(session?.user?.privkey)
  const canServerSign = Boolean(normalizedSessionPrivkey) && !isNip07User(session?.provider)

  const {
    sendZap,
    retryWeblnPayment,
    resetZapState,
    zapState,
    isZapInFlight,
    minZapSats,
    maxZapSats
  } = useZapSender({
    eventId,
    eventKind,
    eventIdentifier,
    eventPubkey,
    zapTarget,
    preferAnonymousZap
  })

  useEffect(() => {
    if (hasReacted) {
      setOptimisticReaction(false)
    }
  }, [hasReacted])


  const handleScrollToComments = () => {
    const commentsSection = document.querySelector('[data-comments-section]')
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleZapDialogOpenChange = (open: boolean) => {
    setIsZapDialogOpen(open)
  }

  const handleSendReaction = async () => {
    if (!eventId) {
      toast({
        title: 'Reaction not available',
        description: 'This content is missing its Nostr event id, so reactions are disabled.',
        variant: 'destructive'
      })
      return
    }

    if (isReacting) {
      return
    }

    if (hasReacted || optimisticReaction) {
      toast({
        title: 'Already liked',
        description: 'You have already sent a reaction for this content.'
      })
      return
    }

    if (sessionStatus === 'loading') {
      toast({
        title: 'Hang tight',
        description: 'We are still loading your session. Try again in a moment.'
      })
      return
    }

    if (sessionStatus !== 'authenticated' || !session?.user) {
      toast({
        title: 'Sign in required',
        description: 'Sign in with a Nostr-capable account to send reactions.',
        variant: 'destructive'
      })
      return
    }

    const tags = buildReactionTags(eventId, eventPubkey, eventKind, eventIdentifier)

    try {
      setIsReacting(true)

      let signedReaction: NostrEvent
      if (canServerSign && normalizedSessionPrivkey) {
        let pubkey: string
        try {
          pubkey = getPublicKey(normalizedSessionPrivkey)
        } catch (err) {
          throw new Error('Stored private key is invalid. Please relink your account and try again.')
        }
        const unsignedReaction = createUnsignedReaction(pubkey, tags)
        const reactionId = await getEventHash(unsignedReaction)
        const reactionSig = await signEvent(reactionId, normalizedSessionPrivkey)
        signedReaction = { ...unsignedReaction, id: reactionId, sig: reactionSig }
      } else {
        const nostr = typeof window !== 'undefined' ? (window as Window & { nostr?: any }).nostr : undefined
        if (!nostr?.signEvent || !nostr?.getPublicKey) {
          throw new Error('Connect a Nostr (NIP-07) extension like Alby or nos2x to send reactions.')
        }
        const extensionPubkey = await nostr.getPublicKey()
        const normalizedExtensionPubkey = normalizeHexPubkey(extensionPubkey)
        if (!normalizedExtensionPubkey) {
          throw new Error('The connected Nostr extension returned an invalid public key.')
        }
        const unsignedReaction = createUnsignedReaction(normalizedExtensionPubkey, tags)
        signedReaction = await nostr.signEvent(unsignedReaction)
      }

      await publish(signedReaction)
      setOptimisticReaction(true)
      toast({
        title: 'Reaction sent',
        description: 'Your like was published to the relays.'
      })
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Unable to publish your reaction.'
      toast({
        title: 'Reaction failed',
        description,
        variant: 'destructive'
      })
    } finally {
      setIsReacting(false)
    }
  }

  const spacing = compact ? 'gap-3 sm:gap-4' : 'gap-4 sm:gap-6'
  const iconSize = compact ? 'h-4 w-4' : 'h-5 w-5'
  const textSize = compact ? 'text-xs' : 'text-xs sm:text-sm'

  const pendingReaction = optimisticReaction && !hasReacted
  const liked = hasReacted || pendingReaction
  const showLikeSpinner = isLoadingLikes || isReacting
  const displayedLikes = likesCount + (pendingReaction ? 1 : 0)
  const likeIconClass = liked
    ? 'text-pink-500 fill-pink-500'
    : 'text-muted-foreground group-hover:text-pink-500'
  const likeCountClass = liked
    ? 'text-pink-500'
    : 'text-foreground group-hover:text-pink-500'
  const likeLabelClass = liked
    ? 'text-pink-500'
    : 'text-muted-foreground group-hover:text-pink-500'
  const zapStats = zapInsights || DEFAULT_ZAP_INSIGHTS
  const zapTotalSatsDisplay = zapStats.totalSats > 0 ? zapStats.totalSats : 0
  const zapUnitLabel = zapTotalSatsDisplay === 1 ? 'sat' : 'sats'
  const viewerHasZapped = Boolean(hasZappedWithLightning || viewerZapTotalSats > 0)
  const zapGlowClass = viewerHasZapped
    ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]'
    : 'text-muted-foreground group-hover:text-primary'
  const zapButtonSecondaryLabel = (() => {
    if (zapState.status === 'error') {
      return 'retry'
    }
    if (zapState.status === 'success') {
      return 'paid'
    }
    if (zapState.status === 'invoice-ready') {
      return 'invoice'
    }
    if (zapState.status === 'paying') {
      return 'webln'
    }
    // In the normal state, we only show the total sats,
    // so no secondary label is needed.
    return null
  })()

  return (
    <div className={`flex items-center flex-wrap ${spacing} ${className}`}>
      {/* Zaps */}
      <Dialog open={isZapDialogOpen} onOpenChange={handleZapDialogOpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className={`group flex items-center space-x-1.5 sm:space-x-2 transition-colors cursor-pointer bg-transparent border-0 p-0 ${compact ? '' : ''}`}
          >
            <ZapIcon className={`${iconSize} transition-colors ${zapGlowClass}`} />
            <span className="inline-flex items-center justify-center font-medium text-foreground group-hover:text-primary transition-colors">
              {isLoadingZaps ? (
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              ) : (
                zapTotalSatsDisplay.toLocaleString()
              )}
            </span>
            <span className={`text-muted-foreground group-hover:text-primary transition-colors ${textSize}`}>
              {zapUnitLabel}
            </span>
            {!compact && zapButtonSecondaryLabel && (
              <span className="text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
                {zapButtonSecondaryLabel}
              </span>
            )}
          </button>
        </DialogTrigger>
        <ZapDialog
          isOpen={isZapDialogOpen}
          zapInsights={zapStats}
          recentZaps={recentZaps}
          hasZappedWithLightning={hasZappedWithLightning}
          viewerZapTotalSats={viewerZapTotalSats}
          zapTarget={zapTarget}
          zapState={zapState}
          sendZap={sendZap}
          retryWeblnPayment={retryWeblnPayment}
          resetZapState={resetZapState}
          isZapInFlight={isZapInFlight}
          minZapSats={minZapSats}
          maxZapSats={maxZapSats}
          preferAnonymousZap={preferAnonymousZap}
          onTogglePrivacy={setPreferAnonymousZap}
        />
      </Dialog>
      
      {/* Comments */}
      <button
        type="button"
        className="group flex items-center space-x-1.5 sm:space-x-2 transition-colors cursor-pointer bg-transparent border-0 p-0"
        onClick={handleScrollToComments}
      >
        <CommentIcon className={`${iconSize} text-muted-foreground group-hover:text-blue-500 transition-colors`} />
        <span className="inline-flex items-center justify-center font-medium text-foreground group-hover:text-blue-500 transition-colors">
          {isLoadingComments ? (
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          ) : (
            commentsCount.toLocaleString()
          )}
        </span>
        <span className={`text-muted-foreground group-hover:text-blue-500 transition-colors ${textSize}`}>
          {commentsCount === 1 ? 'comment' : 'comments'}
        </span>
      </button>
      
      {/* Likes / Reactions */}
      <button
        type="button"
        onClick={handleSendReaction}
        className={`group flex items-center space-x-1.5 sm:space-x-2 transition-colors bg-transparent border-0 p-0 ${isReacting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
        disabled={isReacting}
      >
        <HeartIcon
          className={`${iconSize} transition-colors ${likeIconClass} ${showLikeSpinner ? 'opacity-60' : ''}`}
        />
        <span className={`inline-flex items-center justify-center font-medium transition-colors ${likeCountClass}`}>
          {showLikeSpinner ? (
            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-pink-500 border-t-transparent animate-spin"></div>
          ) : (
            displayedLikes.toLocaleString()
          )}
        </span>
        <span className={`transition-colors ${likeLabelClass} ${textSize}`}>
          {displayedLikes === 1 ? 'like' : 'likes'}
        </span>
      </button>
    </div>
  )
}
