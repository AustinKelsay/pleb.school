"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptimizedImage } from "@/components/ui/optimized-image"
import {
  BookOpen,
  User,
  Users,
  Zap,
  Calendar,
  Lock,
  Unlock,
  MessageCircle,
  Heart,
  Eye
} from "lucide-react"
import type { ContentItem } from "@/data/types"
import { contentTypeIcons } from "@/data/config"
import { useRouter } from 'next/navigation'
import React, { useState, useEffect } from "react"
import { useNostr, type NormalizedProfile } from "@/hooks/useNostr"
import { useInteractions } from "@/hooks/useInteractions"
import { encodePublicKey, decodeAddress } from "snstr"
import { useSession } from "@/hooks/useSession"
import { getPurchaseIcon } from "@/lib/payments-config"

// Icon lookup at module level (not during render) to avoid React rules violation
const ShieldCheckIcon = getPurchaseIcon("shieldCheck")

interface HomepageItem {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  type?: string
  enrollmentCount?: number
}

interface ContentCardProps {
  item: ContentItem | HomepageItem
  variant?: 'content' | 'course' | 'homepage'
  onTagClick?: (tag: string) => void
  className?: string
  showContentTypeTags?: boolean
}

function isContentItem(item: ContentItem | HomepageItem): item is ContentItem {
  return 'type' in item && 'id' in item
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`
  return `${Math.floor(diffInSeconds / 31536000)}y ago`
}


function formatNpubWithEllipsis(pubkey: string): string {
  try {
    const npub = encodePublicKey(pubkey as `${string}1${string}`);
    return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
  } catch {
    // Fallback to hex format if encoding fails
    return `${pubkey.slice(0, 6)}...${pubkey.slice(-6)}`;
  }
}

export function ContentCard({ 
  item, 
  variant = 'content', 
  onTagClick,
  className = "",
  showContentTypeTags = false
}: ContentCardProps) {
  const isContent = isContentItem(item)
  const router = useRouter()
  const { fetchProfile, normalizeKind0 } = useNostr()
  const { status: sessionStatus } = useSession()
  const isAuthenticated = sessionStatus === 'authenticated'
  const isSessionLoading = sessionStatus === 'loading'

  // State to store the instructor's profile data
  const [instructorProfile, setInstructorProfile] = useState<NormalizedProfile | null>(null)
  
  // Helper function to extract hex event ID for interactions
  const getEventId = (noteId: string | undefined): string | undefined => {
    if (!noteId) return undefined
    
    // Only use 64-character hex event IDs
    if (noteId.length === 64 && /^[a-f0-9]+$/i.test(noteId)) {
      return noteId
    }
    
    return undefined
  }

  // Get interaction data from Nostr if this is a content item with a note ID
  const eventId = isContent ? getEventId(item.noteId) : undefined
  
  const { interactions, isLoadingZaps, isLoadingLikes, isLoadingComments, zapInsights } = useInteractions({
    eventId,
    realtime: false,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  // Fetch instructor profile when component mounts and has instructor data
  useEffect(() => {
    const fetchInstructorProfile = async () => {
      if (isContent && 'instructorPubkey' in item && item.instructorPubkey) {
        try {
          const profileEvent = await fetchProfile(item.instructorPubkey)
          const normalizedProfile = normalizeKind0(profileEvent)
          setInstructorProfile(normalizedProfile)
        } catch (error) {
          console.error('Error fetching instructor profile:', error)
        }
      }
    }

    fetchInstructorProfile()
  }, [isContent, fetchProfile, normalizeKind0, item])

  const navigateToContent = () => {
    if (!isContent) return

    if (item.type === 'course') {
      router.push(`/courses/${item.id}`)
    } else {
      router.push(`/content/${item.id}`)
    }
  }

  const handleCardClick = () => {
    navigateToContent()
  }
  
  // Homepage variant uses gradients
  if (variant === 'homepage') {
    const homepageItem = item as HomepageItem
    return (
      <Card className={`overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${className}`}>
        <div className={`h-32 bg-gradient-to-br ${homepageItem.gradient} flex items-center justify-center`}>
          <homepageItem.icon className="h-8 w-8 text-primary" />
        </div>
        <CardHeader>
          <CardTitle className="text-lg">{homepageItem.title}</CardTitle>
          <CardDescription>{homepageItem.description}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Use only real interaction data - no fallbacks to mock data
  const zapsCount = interactions.zaps
  const commentsCount = interactions.comments 
  const reactionsCount = interactions.likes
  const zapTotalSats = zapInsights?.totalSats ?? 0
  const isPremium = isContent && (item as ContentItem).price > 0
  const price = isContent ? (item as ContentItem).price : 0
  const showEnrollmentCount = !isContent && 'enrollmentCount' in item
    && typeof item.enrollmentCount === 'number'
    && item.enrollmentCount > 0
  const purchasedCount = isContent && Array.isArray((item as ContentItem).purchases)
    ? (item as ContentItem).purchases!.filter((p) => {
        const snapshot = p.priceAtPurchase
        const snapshotValid = snapshot !== null && snapshot !== undefined && snapshot > 0
        const required = Math.min(snapshotValid ? snapshot : price, price)
        return (p.amountPaid ?? 0) >= (required ?? 0)
      }).length
    : 0
  const isPurchased = purchasedCount > 0

  return (
    <Card
      className={`overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer group flex flex-col h-full ${className}`}
      onClick={handleCardClick}
    >
      {/* Thumbnail/Image Area - 16:9 aspect ratio like YouTube */}
      <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 overflow-hidden">
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
        
        {/* Actual image if available */}
        {(() => {
          if (isContent && (item.image || ('thumbnailUrl' in item && item.thumbnailUrl))) {
            const imageSrc = item.image || ('thumbnailUrl' in item ? item.thumbnailUrl : '') || '/placeholder.svg';
            return (
              <OptimizedImage 
                src={imageSrc as string} 
                alt={item.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            );
          }
          return null;
        })()}
        
        {/* Content type icon overlay */}
        <div className="absolute top-3 left-3 p-2 rounded-lg bg-transparent backdrop-blur-xs border shadow-sm">
          {(() => {
            const IconComponent = isContent ? (contentTypeIcons[item.type] || BookOpen) : BookOpen
            return <IconComponent className="h-4 w-4 text-foreground" />
          })()}
        </div>
        
        {/* Engagement metrics on the right */}
        <div className="absolute bottom-3 right-3">
          <div className="flex items-center gap-2">
            {/* Zaps */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border hover:border-amber-500 transition-colors cursor-pointer group">
              <Zap className="h-3 w-3 text-muted-foreground group-hover:text-amber-500 transition-colors" />
              <span className="text-xs font-bold text-foreground group-hover:text-amber-500 transition-colors">
                {isLoadingZaps ? (
                  <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>
                ) : (
                  zapTotalSats.toLocaleString()
                )}
              </span>
            </div>
            
            {/* Comments */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border hover:border-blue-500 transition-colors cursor-pointer group">
              <MessageCircle className="h-3 w-3 text-muted-foreground group-hover:text-blue-500 transition-colors" />
              <span className="text-xs font-bold text-foreground group-hover:text-blue-500 transition-colors">
                {isLoadingComments ? (
                  <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                ) : (
                  commentsCount
                )}
              </span>
            </div>
            
            {/* Reactions */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-transparent backdrop-blur-xs shadow-sm border hover:border-pink-500 transition-colors cursor-pointer group">
              <Heart className="h-3 w-3 text-muted-foreground group-hover:text-pink-500 transition-colors" />
              <span className="text-xs font-bold text-foreground group-hover:text-pink-500 transition-colors">
                {isLoadingLikes ? (
                  <div className="w-4 h-4 rounded-full border-2 border-pink-500 border-t-transparent animate-spin"></div>
                ) : (
                  reactionsCount
                )}
              </span>
            </div>
          </div>
        </div>
        
        {/* Central content icon - only show if no image */}
        {!isContent || (!item.image && !('thumbnailUrl' in item && item.thumbnailUrl)) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {variant === 'course' ? (
              <BookOpen className="h-12 w-12 text-primary/60" />
            ) : (() => {
              const IconComponent = isContent ? (contentTypeIcons[item.type] || BookOpen) : BookOpen
              return <IconComponent className="h-12 w-12 text-primary/60" />
            })()}
          </div>
        ) : null}
      </div>
      
      <CardHeader className="pb-3">
        {/* Title */}
        <CardTitle className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {item.title}
        </CardTitle>
        
        {/* Tags and Payment Badge */}
        <div className="flex items-center justify-between gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          {/* Topic Tags */}
          <div className="flex flex-wrap gap-2 flex-1">
            {isContent && item.topics && item.topics.slice(0, 3).map((topic, index) => {
              // remove the 'document' 'video', and or 'course' topic IF showContentTypeTags is false
              if (!showContentTypeTags && (topic === 'document' || topic === 'video' || topic === 'course')) {
                return null
              } else if (showContentTypeTags && (topic === 'document' || topic === 'video' || topic === 'course')) {
                return (
                  <Badge 
                    key={index} 
                    variant="outline" 
                    className="text-xs cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => onTagClick?.(topic)}
                  >
                    {topic}
                  </Badge>
                )
              }

              return (
                <Badge 
                  key={index} 
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onTagClick?.(topic)}
                >
                {topic}
              </Badge>
              )
            })
          }
          </div>
          
          {/* Payment Badge */}
          {isContent && (
            <div className="flex-shrink-0 ml-2 flex items-center gap-2">
              {isPurchased ? (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 border border-success/50">
                  <ShieldCheckIcon className="h-3 w-3 text-success" />
                  <span className="text-xs font-medium text-success">Purchased</span>
                </div>
              ) : isPremium ? (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                  <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {item.price?.toLocaleString() || '40000'} sats
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <Unlock className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Free</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 flex-grow flex flex-col">
        {/* Description */}
        <CardDescription className="text-sm leading-relaxed line-clamp-3 mb-4">
          {item.description}
        </CardDescription>

        {/* Spacer pushes remaining content to bottom */}
        <div className="flex-grow" />

        {showEnrollmentCount && typeof item.enrollmentCount === 'number' && (
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{item.enrollmentCount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Time ago and instructor */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>
              {isContent ? formatTimeAgo(item.createdAt) : '4 months ago'}
            </span>
          </div>
          
          {isContent && 'instructor' in item && item.instructor && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>
                {instructorProfile?.name || 
                 instructorProfile?.display_name || 
                 (('instructorPubkey' in item && item.instructorPubkey) ? formatNpubWithEllipsis(item.instructorPubkey) : 'Unknown')}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {isContent && (!isPremium || isPurchased) ? (
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              onClick={navigateToContent}
            >
              <Eye className="h-4 w-4 mr-2" />
              {item.type === 'course' ? 'Start Learning' : 'View Content'}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              disabled={isSessionLoading}
              onClick={() => {
                if (!isContent) return

                if (!isAuthenticated) {
                  router.push('/auth/signin')
                  return
                }

                navigateToContent()
              }}
            >
              <User className="h-4 w-4 mr-2" />
              {isSessionLoading
                ? 'Loading...'
                : isAuthenticated
                  ? item.type === 'course'
                    ? 'View Course'
                    : 'View & Unlock'
                  : 'Login'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
