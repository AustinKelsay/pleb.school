'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DraftBadge } from '@/components/ui/draft-badge'
import { Input } from '@/components/ui/input'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useAllDraftsQuery, useDeleteDraft, type CourseDraft, type ResourceDraft } from '@/hooks/useAllDraftsQuery'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Plus,
  BookOpen,
  FileText,
  Video,
  Clock,
  Edit,
  Eye,
  Trash2,
  Share,
  Filter,
  Loader2
} from 'lucide-react'
import { getCourseIcon } from '@/lib/copy-icons'

const PriceIcon = getCourseIcon('price')

// Type guards
function isCourseDraft(draft: CourseDraft | ResourceDraft): draft is CourseDraft {
  return draft.draftType === 'course'
}

/**
 * Draft card component - styled to match content-card.tsx
 */
function DraftCard({ draft }: { draft: CourseDraft | ResourceDraft }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { deleteCourseDraft, deleteResourceDraft } = useDeleteDraft()
  const [isDeleting, setIsDeleting] = useState(false)

  const formatTimeAgo = (dateString: string): string => {
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'course':
        return BookOpen
      case 'video':
        return Video
      default:
        return FileText
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      if (isCourseDraft(draft)) {
        await deleteCourseDraft(draft.id)
      } else {
        await deleteResourceDraft(draft.id)
      }
      
      // Invalidate the drafts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['drafts'] })
    } catch (error) {
      console.error('Failed to delete draft:', error)
      alert('Failed to delete draft. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const isPremium = (draft.price ?? 0) > 0
  const type = isCourseDraft(draft) ? 'course' : draft.type
  const draftUrl = isCourseDraft(draft) ? `/drafts/courses/${draft.id}` : `/drafts/resources/${draft.id}`
  const editUrl = isCourseDraft(draft) ? `/create?type=course&draft=${draft.id}` : `/create?type=resource&draft=${draft.id}`
  const publishUrl = `${draftUrl}/publish`
  const TypeIcon = getTypeIcon(type)
  const showLessonCount = isCourseDraft(draft)

  const handleCardClick = () => {
    router.push(draftUrl)
  }

  return (
    <Card 
      className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer group"
      onClick={handleCardClick}
    >
      {/* Thumbnail/Image Area - 16:9 aspect ratio like content-card */}
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
        {draft.image ? (
          <OptimizedImage
            src={draft.image}
            alt={draft.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : null}
        
        {/* Content type icon overlay */}
        <div className="absolute top-3 left-3 p-2 rounded-lg bg-transparent backdrop-blur-xs border shadow-sm">
          <TypeIcon className="h-4 w-4 text-foreground" />
        </div>
        
        {/* Draft status badge on the right */}
        <div className="absolute top-3 right-3">
          <DraftBadge variant="outline" className="bg-transparent backdrop-blur-xs shadow-sm" />
        </div>
        
        {/* Action buttons overlay - bottom right */}
        <div className="absolute bottom-3 right-3">
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-transparent backdrop-blur-xs shadow-sm border hover:bg-background/80"
              asChild
            >
              <Link href={editUrl}>
                <Edit className="h-3 w-3" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-transparent backdrop-blur-xs shadow-sm border hover:bg-background/80"
              asChild
            >
              <Link href={publishUrl}>
                <Share className="h-3 w-3" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-transparent backdrop-blur-xs shadow-sm border hover:bg-destructive/20 hover:border-destructive/50"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3 text-destructive" />
              )}
            </Button>
          </div>
        </div>
        
        {/* Central content icon - only show if no image */}
        {!draft.image && (
          <div className="absolute inset-0 flex items-center justify-center">
            <TypeIcon className="h-12 w-12 text-primary/60" />
          </div>
        )}
      </div>
      
      <CardHeader className="pb-3">
        {/* Title */}
        <CardTitle className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {draft.title}
        </CardTitle>
        
        {/* Tags and Payment Badge */}
        <div className="flex items-center justify-between gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          {/* Topic Tags */}
          <div className="flex flex-wrap gap-2 flex-1">
            {draft.topics && draft.topics.slice(0, 3).map((topic, index) => (
              <Badge 
                key={index} 
                variant="outline"
                className="text-xs cursor-pointer hover:bg-accent transition-colors"
              >
                {topic}
              </Badge>
            ))}
          </div>
          
          {/* Payment Badge */}
          <div className="flex-shrink-0 ml-2">
            {isPremium ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <PriceIcon className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {draft.price?.toLocaleString() || '0'} sats
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <FileText className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-xs font-medium text-green-700 dark:text-green-300">Free</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Description */}
        <CardDescription className="text-sm leading-relaxed line-clamp-3 mb-4">
          {draft.summary}
        </CardDescription>

        {/* Stats Row */}
        {showLessonCount && (
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                <span>{draft.lessonCount} lessons</span>
              </div>
            </div>
          </div>
        )}

        {/* Time ago */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Updated {formatTimeAgo(draft.updatedAt)}</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button 
            className="w-full" 
            size="sm"
            variant="outline"
            onClick={() => router.push(draftUrl)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview Draft
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Main drafts client component
 */
export default function DraftsClient() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<'all' | 'courses' | 'resources'>('all')
  const [page, setPage] = useState(1)
  
  const { data, isLoading, isError, error } = useAllDraftsQuery({
    page,
    pageSize: 12,
    type: selectedType === 'courses' ? 'course' : selectedType === 'resources' ? 'resource' : 'all'
  })

  // Filter drafts based on search
  const filteredDrafts = data?.data.filter(draft => {
    const matchesSearch = draft.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         draft.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         draft.topics.some(topic => topic.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesSearch
  }) || []

  const stats = data?.stats || {
    totalCourses: 0,
    totalResources: 0,
    totalDrafts: 0,
    premiumDrafts: 0,
    freeDrafts: 0
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Loading skeleton */}
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-2/3 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
            <div className="h-24 bg-muted rounded"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Error Loading Drafts</h3>
        <p className="text-muted-foreground mb-4">
          {error?.message || 'Failed to load drafts'}
        </p>
        <Button onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Draft Content</h1>
            <p className="text-muted-foreground">
              Manage your draft courses and resources before publishing to Nostr
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button asChild>
              <Link href="/create?type=course">
                <Plus className="h-4 w-4 mr-2" />
                New Course
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/create?type=resource">
                <Plus className="h-4 w-4 mr-2" />
                New Resource
              </Link>
            </Button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drafts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Button
              size="sm"
              variant={selectedType === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedType('all')}
            >
              All ({stats.totalDrafts})
            </Button>
            <Button
              size="sm"
              variant={selectedType === 'courses' ? 'default' : 'outline'}
              onClick={() => setSelectedType('courses')}
            >
              Courses ({stats.totalCourses})
            </Button>
            <Button
              size="sm"
              variant={selectedType === 'resources' ? 'default' : 'outline'}
              onClick={() => setSelectedType('resources')}
            >
              Resources ({stats.totalResources})
            </Button>
          </div>
        </div>
      </div>

      {/* Draft Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDrafts}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalCourses} courses, {stats.totalResources} resources
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Ready to Publish</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {data?.data.filter(d => new Date(d.updatedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Recently updated drafts
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Premium Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {stats.premiumDrafts}
            </div>
            <p className="text-xs text-muted-foreground">
              Paid drafts ready for monetization
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {filteredDrafts.length === 0 && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery ? 'No drafts found' : 'No drafts yet'}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {searchQuery 
              ? `No drafts match "${searchQuery}". Try adjusting your search terms.`
              : 'Create your first course or resource draft to get started with content creation.'
            }
          </p>
          {!searchQuery && (
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button asChild>
                <Link href="/create?type=course">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Course Draft
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/create?type=resource">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Resource Draft
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Drafts Grid */}
      {filteredDrafts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={!data.pagination.hasPrev}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!data.pagination.hasNext}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
