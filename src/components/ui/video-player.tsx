/**
 * Video player component that handles different video formats
 * Supports YouTube, Vimeo, direct video files, and custom CDN URLs
 */

'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, Pause, Volume2, VolumeX, Maximize, ExternalLink, Download } from 'lucide-react'
import { sanitizeContent } from '@/lib/content-utils'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface VideoPlayerProps {
  content?: string
  url?: string
  title?: string
  videoUrl?: string
  thumbnailUrl?: string
  className?: string
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/user\/[^\/]+#p\/[au]\/\d+\/([^&\n?#]+)/,
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

/**
 * Extract Vimeo video ID from URL
 */
function extractVimeoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

/**
 * Determine video type from URL
 */
function getVideoType(url: string): 'youtube' | 'vimeo' | 'direct' | 'unknown' {
  if (!url) return 'unknown'
  
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube'
  }
  
  if (url.includes('vimeo.com')) {
    return 'vimeo'
  }
  
  // Check for common video file extensions
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m3u8']
  if (videoExtensions.some(ext => url.toLowerCase().includes(ext))) {
    return 'direct'
  }
  
  return 'unknown'
}

/**
 * Check if content contains embedded video
 */
function isEmbeddedVideo(content: string | undefined): boolean {
  if (!content) return false
  return content.includes('<video') || content.includes('<iframe')
}

/**
 * Extract video source from content
 */
function extractVideoSource(content: string | undefined): string | null {
  if (!content) return null
  
  // Check for direct video source
  const sourceMatch = content.match(/src="([^"]+\.(mp4|webm|mov|avi))"/i)
  if (sourceMatch) return sourceMatch[1]
  
  // Check for YouTube embed
  const youtubeMatch = content.match(/src="[^"]*youtube\.com\/embed\/([^"?]+)/i)
  if (youtubeMatch) return `https://www.youtube.com/watch?v=${youtubeMatch[1]}`
  
  return null
}

/**
 * Video controls component
 */
const VideoControls = ({ videoUrl }: { videoUrl?: string }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-muted/50 border-t">
      <div className="flex items-center space-x-2">
        <Badge variant="secondary" className="text-xs">
          Video
        </Badge>
      </div>
      
      <div className="flex items-center space-x-2">
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
  const sanitizedContent = sanitizeContent(content)
  
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <div 
        className="w-full h-full"
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
  return (
    <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-lg overflow-hidden cursor-pointer group">
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
        <Button
          size="lg"
          className="rounded-full bg-primary/90 hover:bg-primary text-primary-foreground"
          onClick={onPlay}
        >
          <Play className="h-6 w-6" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Render embedded video based on type
 */
function VideoEmbed({ url }: { url: string }) {
  const videoType = getVideoType(url)
  
  if (videoType === 'youtube') {
    const videoId = extractYouTubeId(url)
    if (!videoId) return null
    
    return (
      <div className="aspect-video">
        <iframe
          width="100%"
          height="100%"
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }
  
  if (videoType === 'vimeo') {
    const videoId = extractVimeoId(url)
    if (!videoId) return null
    
    return (
      <div className="aspect-video">
        <iframe
          src={`https://player.vimeo.com/video/${videoId}`}
          width="100%"
          height="100%"
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }
  
  if (videoType === 'direct') {
    return (
      <div className="aspect-video">
        <video
          controls
          className="w-full h-full object-contain bg-black"
          src={url}
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
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </a>
        </Button>
      </div>
    </div>
  )
}

/**
 * Main video player component
 */
export function VideoPlayer({ 
  content, 
  url,
  title, 
  videoUrl, 
  thumbnailUrl, 
  className = '' 
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [showThumbnail, setShowThumbnail] = useState(true)
  
  const handlePlay = () => {
    setIsPlaying(true)
    setShowThumbnail(false)
  }
  
  // Use url prop if provided, otherwise fall back to content or videoUrl
  const effectiveUrl = url || videoUrl || extractVideoSource(content) || ''
  const isEmbedded = isEmbeddedVideo(content)
  const hasValidUrl = effectiveUrl && effectiveUrl.length > 0
  
  return (
    <Card className={className}>
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
          <VideoEmbed url={effectiveUrl} />
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
        
        <VideoControls videoUrl={effectiveUrl} />
      </CardContent>
    </Card>
  )
}

/**
 * Simple inline video embed component for HTML content
 */
export function InlineVideoEmbed({ content, className = '' }: { content: string; className?: string }) {
  const sanitizedContent = sanitizeContent(content)
  
  return (
    <div className={`aspect-video rounded-lg overflow-hidden ${className}`}>
      <div 
        className="w-full h-full"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </div>
  )
} 
