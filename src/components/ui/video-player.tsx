/**
 * Video player component that handles different video formats
 * Supports YouTube, Vimeo, direct video files, and custom CDN URLs
 */

'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Play, RotateCcw, RotateCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { sanitizeRichContent } from '@/lib/rich-content-sanitize.client'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { getPlaybackConfig } from '@/lib/content-config'
import {
  clampSeekTarget,
  extractVideoSource,
  extractVimeoId,
  extractYouTubeId,
  getVideoProvider,
  isEditableTarget,
  isEmbeddedVideo,
  normalizeSkipSeconds,
  type SkipSeconds,
} from '@/lib/video-playback'

interface VideoPlayerProps {
  content?: string
  url?: string
  title?: string
  videoUrl?: string
  thumbnailUrl?: string
  className?: string
  skipSeconds?: SkipSeconds
}

type YouTubePlayerLike = {
  getCurrentTime: () => number
  getDuration: () => number
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  destroy: () => void
}

type VimeoPlayerLike = {
  ready: () => Promise<void>
  getCurrentTime: () => Promise<number>
  getDuration: () => Promise<number>
  setCurrentTime: (seconds: number) => Promise<number>
  destroy?: () => Promise<void> | void
}

declare global {
  interface Window {
    YT?: {
      Player: new (element: string | HTMLElement, options: Record<string, unknown>) => YouTubePlayerLike
    }
    onYouTubeIframeAPIReady?: (() => void) | null
    Vimeo?: {
      Player: new (element: HTMLElement | HTMLIFrameElement) => VimeoPlayerLike
    }
  }
}

let youtubeApiPromise: Promise<void> | null = null
let vimeoApiPromise: Promise<void> | null = null

function sanitizeMediaUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim()
  if (!raw) {
    return ""
  }

  const collapsedForSchemeCheck = raw.replace(/[\x00-\x1F\x7F\s]+/g, "")
  const schemeMatch = collapsedForSchemeCheck.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)

  if (schemeMatch) {
    const scheme = schemeMatch[1]?.toLowerCase()
    if (scheme !== "http" && scheme !== "https" && scheme !== "blob") {
      return ""
    }

    try {
      const parsed = new URL(raw)
      if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:") {
        return raw
      }
      return ""
    } catch {
      return ""
    }
  }

  if (raw.startsWith("//")) {
    return ""
  }

  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) {
    return raw
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(raw)) {
    return `https://${raw}`
  }

  return ""
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  if (window.YT?.Player) {
    return Promise.resolve()
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  const promise = new Promise<void>((resolve, reject) => {
    const scriptSrc = 'https://www.youtube.com/iframe_api'
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`)
    const previousReady = window.onYouTubeIframeAPIReady
    let settled = false

    const finalize = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    let pollId = 0
    const timeoutId = window.setTimeout(() => {
      if (pollId) {
        window.clearInterval(pollId)
      }
      cleanup()
      restoreReadyCallback()
      finalize(() => reject(new Error('Timed out loading YouTube Iframe API')))
    }, 10000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
    }

    const restoreReadyCallback = () => {
      if (window.onYouTubeIframeAPIReady === readyCallback) {
        window.onYouTubeIframeAPIReady = previousReady ?? null
      }
    }

    const readyCallback = () => {
      previousReady?.()
      cleanup()
      restoreReadyCallback()
      finalize(() => resolve())
    }
    window.onYouTubeIframeAPIReady = readyCallback

    pollId = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(pollId)
        cleanup()
        restoreReadyCallback()
        finalize(() => resolve())
      }
    }, 100)

    const onError = () => {
      window.clearInterval(pollId)
      cleanup()
      restoreReadyCallback()
      finalize(() => reject(new Error('Failed to load YouTube Iframe API')))
    }

    if (existingScript) {
      existingScript.addEventListener('error', onError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.addEventListener('error', onError, { once: true })
    document.head.appendChild(script)
  })
    .catch((error: unknown) => {
      youtubeApiPromise = null
      throw error
    })

  youtubeApiPromise = promise
  return promise
}

function loadVimeoPlayerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  if (window.Vimeo?.Player) {
    return Promise.resolve()
  }

  if (vimeoApiPromise) {
    return vimeoApiPromise
  }

  const promise = new Promise<void>((resolve, reject) => {
    const scriptSrc = 'https://player.vimeo.com/api/player.js'
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`)
    let settled = false

    const finalize = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    const timeoutId = window.setTimeout(() => {
      finalize(() => reject(new Error('Timed out loading Vimeo Player API')))
    }, 10000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
    }

    const onLoad = () => {
      cleanup()
      finalize(() => resolve())
    }

    const onError = () => {
      cleanup()
      finalize(() => reject(new Error('Failed to load Vimeo Player API')))
    }

    if (existingScript) {
      if (window.Vimeo?.Player) {
        onLoad()
      } else {
        existingScript.addEventListener('load', onLoad, { once: true })
        existingScript.addEventListener('error', onError, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })
    document.head.appendChild(script)
  })
    .catch((error: unknown) => {
      vimeoApiPromise = null
      throw error
    })

  vimeoApiPromise = promise
  return promise
}

interface VideoControlsProps {
  videoUrl?: string
  skipSeconds: SkipSeconds
  canSeek: boolean
  seekDisabledReason?: string
  onRewind: () => void
  onFastForward: () => void
}

/**
 * Video controls component
 */
const VideoControls = ({
  videoUrl,
  skipSeconds,
  canSeek,
  seekDisabledReason,
  onRewind,
  onFastForward,
}: VideoControlsProps) => {
  const rewindLabel = `Rewind ${skipSeconds} seconds`
  const fastForwardLabel = `Fast-forward ${skipSeconds} seconds`

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-muted/50 border-t">
      <div className="flex items-center space-x-2">
        <Badge variant="secondary" className="text-xs">
          Video
        </Badge>
      </div>

      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRewind}
          disabled={!canSeek}
          aria-label={rewindLabel}
          title={!canSeek ? seekDisabledReason : rewindLabel}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          -{skipSeconds}s
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFastForward}
          disabled={!canSeek}
          aria-label={fastForwardLabel}
          title={!canSeek ? seekDisabledReason : fastForwardLabel}
        >
          <RotateCw className="h-4 w-4 mr-1" />
          +{skipSeconds}s
        </Button>
        {videoUrl && (
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Watch on Platform
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Embedded video renderer
 */
function EmbeddedVideoRenderer({ content }: { content: string }) {
  const sanitizedContent = sanitizeRichContent(content)

  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <div
        className="w-full h-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized by sanitizeRichContent before rendering.
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </div>
  )
}

/**
 * Video thumbnail with play button
 */
function VideoThumbnail({
  thumbnailUrl,
  title,
  onPlay
}: {
  thumbnailUrl?: string;
  title?: string;
  onPlay: () => void
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPlay()
    }
  }

  return (
    <div
      className="relative aspect-video bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-lg overflow-hidden cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      role="button"
      tabIndex={0}
      aria-label={title ? `Play video: ${title}` : 'Play video'}
      onClick={onPlay}
      onKeyDown={handleKeyDown}
    >
      {thumbnailUrl ? (
        <OptimizedImage
          src={thumbnailUrl}
          alt={title || 'Video thumbnail'}
          className="w-full h-full object-cover"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <Play className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground">Video Content</p>
            <p className="text-sm text-muted-foreground">Click to play</p>
          </div>
        </div>
      )}

      {/* Play button overlay */}
      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          aria-hidden="true"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-md transition-colors group-hover:bg-primary"
        >
          <Play className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}

/**
 * Main video player component
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  content,
  url,
  title,
  videoUrl,
  thumbnailUrl,
  className = '',
  skipSeconds,
}) => {
  const [showThumbnail, setShowThumbnail] = useState(Boolean(thumbnailUrl))
  const [isSeekReady, setIsSeekReady] = useState(false)
  const [providerSeekFailureReason, setProviderSeekFailureReason] = useState<string | null>(null)

  const directVideoRef = useRef<HTMLVideoElement | null>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null)
  const youtubePlayerRef = useRef<YouTubePlayerLike | null>(null)
  const vimeoIframeRef = useRef<HTMLIFrameElement | null>(null)
  const vimeoPlayerRef = useRef<VimeoPlayerLike | null>(null)

  const configuredSkipSeconds = getPlaybackConfig().defaultSkipSeconds
  const resolvedSkipSeconds = normalizeSkipSeconds(skipSeconds ?? configuredSkipSeconds)

  const handlePlay = useCallback(() => {
    setShowThumbnail(false)
  }, [])

  // Use url prop if provided, otherwise fall back to content or videoUrl.
  const rawEffectiveUrl = useMemo(
    () => url || videoUrl || extractVideoSource(content) || '',
    [content, url, videoUrl]
  )
  const effectiveUrl = useMemo(() => sanitizeMediaUrl(rawEffectiveUrl), [rawEffectiveUrl])
  const provider = useMemo(() => getVideoProvider(effectiveUrl), [effectiveUrl])
  const youtubeId = useMemo(() => extractYouTubeId(effectiveUrl), [effectiveUrl])
  const vimeoId = useMemo(() => extractVimeoId(effectiveUrl), [effectiveUrl])
  const isEmbedded = isEmbeddedVideo(content)
  const hasValidUrl = effectiveUrl.length > 0

  useEffect(() => {
    setShowThumbnail(Boolean(thumbnailUrl))
  }, [effectiveUrl, thumbnailUrl])

  useEffect(() => {
    if (showThumbnail) {
      setIsSeekReady(false)
      setProviderSeekFailureReason(null)
      return
    }

    if (!hasValidUrl) {
      setIsSeekReady(false)
      return
    }

    if (provider === 'direct') {
      setProviderSeekFailureReason(null)
      const element = directVideoRef.current
      if (!element) {
        setIsSeekReady(false)
        return
      }

      const markReady = () => setIsSeekReady(true)
      const markNotReady = () => setIsSeekReady(false)

      if (element.readyState >= 1) {
        markReady()
      }

      element.addEventListener('loadedmetadata', markReady)
      element.addEventListener('durationchange', markReady)
      element.addEventListener('emptied', markNotReady)

      return () => {
        element.removeEventListener('loadedmetadata', markReady)
        element.removeEventListener('durationchange', markReady)
        element.removeEventListener('emptied', markNotReady)
      }
    }

    return
  }, [hasValidUrl, provider, showThumbnail])

  useEffect(() => {
    if (showThumbnail || provider !== 'youtube' || !youtubeId) {
      return
    }

    let cancelled = false

    const setup = async () => {
      try {
        await loadYouTubeIframeApi()
        if (cancelled || !youtubeIframeRef.current || !window.YT?.Player) {
          if (!cancelled) {
            setProviderSeekFailureReason('Seek controls unavailable: YouTube player API could not initialize.')
          }
          return
        }

        const player = new window.YT.Player(youtubeIframeRef.current, {
          playerVars: {
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!cancelled) {
                setIsSeekReady(true)
                setProviderSeekFailureReason(null)
              }
            },
            onError: () => {
              if (!cancelled) {
                setIsSeekReady(false)
                setProviderSeekFailureReason('Seek controls unavailable: YouTube player API reported an error.')
              }
            },
          },
        })

        youtubePlayerRef.current = player
      } catch {
        if (!cancelled) {
          setIsSeekReady(false)
          setProviderSeekFailureReason('Seek controls unavailable: YouTube player API failed to load.')
        }
      }
    }

    setIsSeekReady(false)
    setProviderSeekFailureReason(null)
    void setup()

    return () => {
      cancelled = true
      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.destroy()
        } catch {
          // Ignore cleanup failures from third-party player APIs.
        }
      }
      youtubePlayerRef.current = null
    }
  }, [provider, showThumbnail, youtubeId])

  useEffect(() => {
    if (showThumbnail || provider !== 'vimeo' || !vimeoId || !vimeoIframeRef.current) {
      return
    }

    let cancelled = false

    const setup = async () => {
      try {
        await loadVimeoPlayerApi()
        if (cancelled) {
          return
        }
        if (!vimeoIframeRef.current || !window.Vimeo?.Player) {
          setIsSeekReady(false)
          setProviderSeekFailureReason('Seek controls unavailable: Vimeo player API is not available.')
          return
        }

        const player = new window.Vimeo.Player(vimeoIframeRef.current)
        vimeoPlayerRef.current = player

        await player.ready()
        if (!cancelled) {
          setIsSeekReady(true)
          setProviderSeekFailureReason(null)
        }
      } catch {
        if (!cancelled) {
          setIsSeekReady(false)
          setProviderSeekFailureReason('Seek controls unavailable: Vimeo player API failed to load.')
        }
      }
    }

    setIsSeekReady(false)
    setProviderSeekFailureReason(null)
    void setup()

    return () => {
      cancelled = true
      const activePlayer = vimeoPlayerRef.current
      if (activePlayer?.destroy) {
        void activePlayer.destroy()
      }
      vimeoPlayerRef.current = null
    }
  }, [provider, showThumbnail, vimeoId])

  const handleSeekBy = useCallback(async (deltaSeconds: number) => {
    if (!hasValidUrl || showThumbnail) {
      return
    }

    if (provider === 'direct') {
      const videoElement = directVideoRef.current
      if (!videoElement) {
        return
      }

      const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : undefined
      videoElement.currentTime = clampSeekTarget(videoElement.currentTime + deltaSeconds, duration)
      return
    }

    if (provider === 'youtube') {
      const player = youtubePlayerRef.current
      if (!player) {
        return
      }

      const currentTime = Number(player.getCurrentTime?.() ?? 0)
      const durationRaw = Number(player.getDuration?.())
      const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined
      const targetTime = clampSeekTarget(currentTime + deltaSeconds, duration)
      player.seekTo(targetTime, true)
      return
    }

    if (provider === 'vimeo') {
      const player = vimeoPlayerRef.current
      if (!player) {
        return
      }

      try {
        const [currentTime, durationRaw] = await Promise.all([
          player.getCurrentTime(),
          player.getDuration(),
        ])
        const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined
        const targetTime = clampSeekTarget(currentTime + deltaSeconds, duration)
        await player.setCurrentTime(targetTime)
      } catch (error) {
        setIsSeekReady(false)
        setProviderSeekFailureReason('Seek controls unavailable: Vimeo seek request failed.')
        console.error('Vimeo seek failed', error)
        return
      }
    }
  }, [hasValidUrl, provider, showThumbnail])

  const canSeek = !showThumbnail && hasValidUrl && isSeekReady && (provider === 'direct' || provider === 'youtube' || provider === 'vimeo')

  const seekDisabledReason = useMemo(() => {
    if (showThumbnail) {
      return 'Start playback to enable seek controls.'
    }
    if (!hasValidUrl) {
      return 'Seek controls are unavailable without a playable URL.'
    }
    if (!(provider === 'direct' || provider === 'youtube' || provider === 'vimeo')) {
      return 'Seek controls are unavailable for this video provider.'
    }
    if (providerSeekFailureReason) {
      return providerSeekFailureReason
    }
    if (!isSeekReady) {
      return 'Player is still loading.'
    }
    return undefined
  }, [hasValidUrl, isSeekReady, provider, providerSeekFailureReason, showThumbnail])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }

    if (isEditableTarget(event.target)) {
      return
    }

    const normalized = event.key.toLowerCase()
    const isSeekBackward = normalized === 'arrowleft' || normalized === 'j'
    const isSeekForward = normalized === 'arrowright' || normalized === 'l'

    if (!isSeekBackward && !isSeekForward) {
      return
    }

    if (!canSeek) {
      return
    }

    event.preventDefault()
    void handleSeekBy(isSeekBackward ? -resolvedSkipSeconds : resolvedSkipSeconds)
  }, [canSeek, handleSeekBy, resolvedSkipSeconds])

  const renderVideoEmbed = () => {
    if (provider === 'youtube' && youtubeId) {
      return (
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          <iframe
            ref={youtubeIframeRef}
            src={`https://www.youtube.com/embed/${youtubeId}?playsinline=1&rel=0&modestbranding=1&enablejsapi=1`}
            width="100%"
            height="100%"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="YouTube video player"
          />
        </div>
      )
    }

    if (provider === 'vimeo' && vimeoId) {
      return (
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          <iframe
            ref={vimeoIframeRef}
            src={`https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&dnt=1`}
            width="100%"
            height="100%"
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Vimeo video player"
          />
        </div>
      )
    }

    if (provider === 'direct') {
      return (
        <div className="aspect-video">
          <video
            ref={directVideoRef}
            controls
            className="w-full h-full object-contain bg-black"
            src={effectiveUrl}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )
    }

    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center">
          <ExternalLink className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium">External Video</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            asChild
          >
            <a href={effectiveUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card
      className={className}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Video player"
    >
      {title && (
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>{title}</span>
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className="p-0">
        {showThumbnail && thumbnailUrl ? (
          <VideoThumbnail
            thumbnailUrl={thumbnailUrl}
            title={title}
            onPlay={handlePlay}
          />
        ) : hasValidUrl ? (
          renderVideoEmbed()
        ) : isEmbedded && content ? (
          <EmbeddedVideoRenderer content={content} />
        ) : (
          <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <div className="mb-4">
                <Play className="h-12 w-12 mx-auto opacity-60" />
              </div>
              <p className="text-lg font-medium">No Video Available</p>
              <p className="text-sm opacity-60">Please provide a valid video URL</p>
            </div>
          </div>
        )}

        <VideoControls
          videoUrl={effectiveUrl}
          skipSeconds={resolvedSkipSeconds}
          canSeek={canSeek}
          seekDisabledReason={seekDisabledReason}
          onRewind={() => {
            void handleSeekBy(-resolvedSkipSeconds)
          }}
          onFastForward={() => {
            void handleSeekBy(resolvedSkipSeconds)
          }}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Simple inline video embed component for HTML content
 */
export function InlineVideoEmbed({ content, className = '' }: { content: string; className?: string }) {
  const sanitizedContent = sanitizeRichContent(content)

  return (
    <div className={`aspect-video rounded-lg overflow-hidden ${className}`}>
      <div
        className="w-full h-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized by sanitizeRichContent before rendering.
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </div>
  )
}
