"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { HighlightText } from "@/components/ui/highlight-text"
import {
  BookOpen,
  Clock,
  User,
  Calendar,
  Lock,
  Unlock,
  Search
} from "lucide-react"
import type { ContentItem } from "@/data/types"
import { contentTypeIcons } from "@/data/config"
import { useRouter } from 'next/navigation'

interface SearchContentCardProps {
  item: ContentItem
  searchKeyword?: string
  onTagClick?: (tag: string) => void
  className?: string
}

// Human-readable labels for matched fields
const matchedFieldLabels: Record<string, string> = {
  title: 'title',
  description: 'description',
  content: 'body',
  tags: 'tags'
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

export function SearchContentCard({ 
  item, 
  searchKeyword,
  onTagClick,
  className = ""
}: SearchContentCardProps) {
  const router = useRouter()

  const handleCardClick = () => {
    // Navigate to appropriate detail page based on content type
    if (item.type === 'course') {
      router.push(`/courses/${item.id}`)
    } else {
      // For resources (documents, videos, guides, etc.), navigate to content detail page
      router.push(`/content/${item.id}`)
    }
  }

  return (
    <Card 
      className={`overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer group ${className}`}
      onClick={handleCardClick}
    >
      <div className="flex gap-4 p-4">
        {/* Image Section */}
        <div className="flex-shrink-0">
          <div className="relative w-24 h-24 bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-lg overflow-hidden">
            {/* Actual image if available */}
            {item.image || ('thumbnailUrl' in item && item.thumbnailUrl) ? (
              <OptimizedImage 
                src={(item.image || ('thumbnailUrl' in item ? item.thumbnailUrl : '')) as string} 
                alt={item.title}
                fill
                className="object-cover"
                sizes="96px"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                {(() => {
                  const IconComponent = contentTypeIcons[item.type] || BookOpen
                  return <IconComponent className="h-6 w-6 text-primary/60" />
                })()}
              </div>
            )}
            
            {/* Content type icon overlay */}
            <div className="absolute top-1 left-1 p-1 rounded bg-background/80 backdrop-blur-sm">
              {(() => {
                const IconComponent = contentTypeIcons[item.type] || BookOpen
                return <IconComponent className="h-3 w-3 text-foreground" />
              })()}
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header with badges */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              {/* Title with highlighting */}
              <CardTitle className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors flex-1">
                {searchKeyword ? (
                  <HighlightText text={item.title} highlight={searchKeyword} />
                ) : (
                  item.title
                )}
              </CardTitle>
              
              {/* Payment Badge */}
              <div className="flex-shrink-0">
                {item.isPremium ? (
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
            </div>
          </div>

          {/* Full Description with highlighting */}
          <CardDescription className="text-sm leading-relaxed">
            {searchKeyword ? (
              <HighlightText text={item.description} highlight={searchKeyword} />
            ) : (
              item.description
            )}
          </CardDescription>

          {/* All Tags */}
          {item.topics && item.topics.length > 0 && (
            <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {item.topics.map((topic, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onTagClick?.(topic)}
                >
                  {searchKeyword ? (
                    <HighlightText text={topic} highlight={searchKeyword} />
                  ) : (
                    topic
                  )}
                </Badge>
              ))}
            </div>
          )}

          {/* Match indicator - shows where keyword was found */}
          {searchKeyword && item.matchedFields && item.matchedFields.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3 w-3 text-primary/60" />
              <span>
                Matched in{' '}
                {item.matchedFields.map((field, idx) => (
                  <span key={field}>
                    <span className="font-medium text-primary/80">
                      {matchedFieldLabels[field] || field}
                    </span>
                    {idx < item.matchedFields!.length - 1 && (
                      <span>{idx === item.matchedFields!.length - 2 ? ' and ' : ', '}</span>
                    )}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {/* Content type */}
            <span className="capitalize font-medium">{item.type}</span>
            
            {/* Instructor */}
            {item.instructor && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{item.instructor}</span>
              </div>
            )}
            
            {/* Duration for videos */}
            {item.duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{item.duration}</span>
              </div>
            )}
            
            {/* Time ago */}
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatTimeAgo(item.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
