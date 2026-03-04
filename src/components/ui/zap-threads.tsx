'use client'

import React, { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle } from 'lucide-react'
import { encodeAddress } from 'snstr'
import { getRelays } from '@/lib/nostr-relays'
import { trackEventSafe } from '@/lib/analytics'

interface ZapThreadsProps {
  /**
   * The anchor for the comments - can be a note, nevent, naddr, or URL
   * For content, use createNaddrAnchor helper function
   * Required unless eventDetails is provided
   */
  anchor?: string
  
  /**
   * Alternative: provide event details to automatically create naddr
   * If provided, anchor prop is optional
   */
  eventDetails?: {
    identifier: string // 'd' tag value (usually the resource/course ID)
    pubkey: string     // Author pubkey
    kind: number       // Event kind (30023 for free content, 30402 for paid, 30004 for courses)
    relays?: string[]  // Optional relays
  }
  
  /**
   * Optional author pubkey to notify when comments are made
   */
  author?: string
  
  /**
   * Optional user npub to pre-login
   */
  user?: string
  
  /**
   * Custom relays (comma-separated)
   * Defaults to the project's Nostr relays if not provided
   */
  relays?: string
  
  /**
   * Features to disable (comma-separated)
   * Available: likes, zaps, reply, publish, watch, replyAnonymously, hideContent
   */
  disable?: string
  
  /**
   * Custom title for the comments section
   */
  title?: string
  
  /**
   * Whether to show the card wrapper
   */
  showCard?: boolean
}

// Type declaration for the zap-threads web component
interface ZapThreadsHTMLElement extends HTMLElement {
  anchor: string
  author?: string
  user?: string
  relays?: string
  disable?: string
}

/**
 * Helper function to create naddr anchor for parameterized replaceable events
 */
export function createNaddrAnchor(options: {
  identifier: string // 'd' tag value
  pubkey: string     // Author pubkey
  kind: number       // Event kind
  relays?: string[]  // Optional relays
}): string {
  try {
    return encodeAddress({
      identifier: options.identifier,
      pubkey: options.pubkey,
      kind: options.kind,
      relays: options.relays || getRelays('zapThreads')
    })
  } catch (error) {
    console.error('Error creating naddr anchor:', error)
    // Fallback to a simple URL-based anchor
    return `https://pleb.school/content/${options.identifier}`
  }
}

export function ZapThreads({
  anchor,
  eventDetails,
  author,
  user,
  relays = getRelays('zapThreads').join(','),
  disable = 'likes,zaps',
  title = 'Comments & Discussion',
  showCard = true
}: ZapThreadsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTrackedAnchorRef = useRef<string | null>(null)
  const finalAnchor = eventDetails ? createNaddrAnchor(eventDetails) : anchor
  const finalAuthor = author || eventDetails?.pubkey
  const anchorType = eventDetails ? "event_details" : "anchor"
  const eventKind = eventDetails?.kind
  const authorType = finalAuthor
    ? (eventDetails ? "event_author" : "explicit_author")
    : "none"
  const titleLengthBucket = (() => {
    const length = title.trim().length
    if (length === 0) return "0"
    if (length <= 20) return "1-20"
    if (length <= 100) return "21-100"
    return "100+"
  })()

  useEffect(() => {
    // Dynamically import zapthreads to avoid SSR issues
    const loadZapThreads = async () => {
      try {
        await import('zapthreads')
      } catch (error) {
        console.error('Failed to load zapthreads:', error)
      }
    }

    loadZapThreads()
  }, [])

  useEffect(() => {
    if (!finalAnchor) return
    if (lastTrackedAnchorRef.current === finalAnchor) return

    lastTrackedAnchorRef.current = finalAnchor
    trackEventSafe("comments_thread_viewed", {
      anchor_type: anchorType,
      event_kind: eventKind,
      has_author: Boolean(finalAuthor),
      author_type: authorType,
      title_length_bucket: titleLengthBucket,
    })
  }, [finalAnchor, finalAuthor, anchorType, eventKind, authorType, titleLengthBucket])

  // Validate that either anchor or eventDetails is provided
  if (!finalAnchor) {
    console.error('ZapThreads: Either anchor or eventDetails must be provided')
    return null
  }

  // Custom CSS variables that match the current theme with responsive font size
  const zapThreadsStyle: React.CSSProperties = {
    '--ztr-font': 'var(--font-family)',
    '--ztr-font-size': 'clamp(13px, 2.5vw, 14px)', // Responsive font size
    '--ztr-text-color': 'hsl(var(--foreground))',
    '--ztr-link-color': 'hsl(var(--primary))',
    '--ztr-background-color': 'hsl(var(--background))',
    '--ztr-icon-color': 'hsl(var(--muted-foreground))',
    '--ztr-login-button-color': 'hsl(var(--primary))',
  } as React.CSSProperties

  const zapThreadsElement = (
    <div ref={containerRef} style={zapThreadsStyle}>
      {React.createElement('zap-threads' as any, {
        anchor: finalAnchor,
        author: finalAuthor,
        user,
        relays,
        disable,
        style: {
          width: '100%',
          minHeight: 'clamp(150px, 30vh, 200px)' // Responsive min height
        }
      })}
    </div>
  )

  if (!showCard) {
    return zapThreadsElement
  }

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-6">
        <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
          <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-6 px-3 sm:px-6">
        {zapThreadsElement}
      </CardContent>
    </Card>
  )
}

export default ZapThreads
