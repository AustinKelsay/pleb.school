"use client"

import { useMemo, useState } from "react"
import {
  Crown,
  Filter,
  X,
  FileText,
  Gift
} from "lucide-react"
import { MainLayout } from "@/components/layout/main-layout"
import { Section } from "@/components/layout/section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ContentCard } from "@/components/ui/content-card"
import { ContentPageSkeleton } from "@/components/ui/content-skeleton"
import { contentTypeFilters } from "@/data/config"
import {
  createCourseDisplay,
  createResourceDisplay,
  parseCourseEvent,
  parseEvent,
  type ContentItem,
} from "@/data/types"
import { useContentConfig } from "@/hooks/useContentConfig"
import { useCoursesQuery } from "@/hooks/useCoursesQuery"
import { useDocumentsQuery } from "@/hooks/useDocumentsQuery"
import { useVideosQuery } from "@/hooks/useVideosQuery"
import { trackEventSafe } from "@/lib/analytics"
import { useCopy, getCopy } from "@/lib/copy"
import { getEventATag } from "@/lib/nostr-a-tag"
import { getNoteImage } from "@/lib/note-image"
import { resolvePreferredDisplayName } from "@/lib/profile-display"

const CONTENT_TYPE_FILTER_SET = new Set(contentTypeFilters.map(({ type }) => type.toLowerCase()))

export default function ContentPage() {
  const { contentLibrary, pricing } = useCopy()
  const contentConfig = useContentConfig()
  const includeLessonResources = contentConfig?.contentPage?.includeLessonResources
  const includeLessonVideos = includeLessonResources?.videos ?? true
  const includeLessonDocuments = includeLessonResources?.documents ?? true
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(['all']))
  
  // Fetch data from all hooks
  const { courses, isLoading: coursesLoading } = useCoursesQuery()
  // Include lesson-linked resources by default so they still appear in the content library,
  // even though other surfaces (e.g. homepage carousels) purposely hide them. Config can override.
  const { videos, isLoading: videosLoading } = useVideosQuery({ includeLessonResources: includeLessonVideos })
  const { documents, isLoading: documentsLoading } = useDocumentsQuery({ includeLessonResources: includeLessonDocuments })
  
  const loading = coursesLoading || videosLoading || documentsLoading
  
  const contentItems = useMemo(() => {
    const allItems: ContentItem[] = []

    if (courses) {
      courses.forEach(course => {
        const parsedCourse = course.note ? parseCourseEvent(course.note) : null
        const display = parsedCourse
          ? createCourseDisplay(course, parsedCourse)
          : {
              title: `Course ${course.id}`,
              description: '',
              image: '',
              instructor: '',
              instructorPubkey: course.user?.pubkey || course.userId,
              topics: [] as string[],
              tags: [] as string[][],
              additionalLinks: [],
            }
        const courseAuthor = resolvePreferredDisplayName({
          preferredNames: [display.instructor],
          user: course.user,
          pubkey: display.instructorPubkey || course.note?.pubkey || course.user?.pubkey || course.userId,
        })

        const courseItem = {
          id: course.id,
          type: 'course' as const,
          title: display.title,
          description: display.description,
          category: course.price > 0 ? pricing.premium : pricing.free,
          image: display.image || getNoteImage(course.note),
          tags: display.tags,
          instructor: courseAuthor,
          instructorPubkey: display.instructorPubkey || '',
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
          price: course.price,
          isPremium: course.price > 0,
          rating: 4.5,
          published: true,
          topics: display.topics,
          additionalLinks: display.additionalLinks ?? [],
          noteId: course.note?.id || course.noteId,
          noteATag: getEventATag(course.note),
          purchases: course.purchases,
        }
        allItems.push(courseItem)
      })
    }

    if (videos) {
      videos.forEach(video => {
        const parsedVideo = video.note ? parseEvent(video.note) : null
        const display = parsedVideo
          ? createResourceDisplay(video, parsedVideo)
          : {
              title: `Video ${video.id}`,
              description: '',
              image: '',
              instructor: '',
              instructorPubkey: video.user?.pubkey || video.userId,
              topics: [] as string[],
              additionalLinks: [],
            }
        const videoAuthor = resolvePreferredDisplayName({
          preferredNames: [display.instructor],
          user: video.user,
          pubkey: display.instructorPubkey || video.note?.pubkey || video.user?.pubkey || video.userId,
        })

        const videoItem = {
          id: video.id,
          type: 'video' as const,
          title: display.title,
          description: display.description,
          category: video.price > 0 ? pricing.premium : pricing.free,
          image: getNoteImage(video.note, video.videoId ? `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg` : display.image),
          tags: parsedVideo?.tags || [],
          instructor: videoAuthor,
          instructorPubkey: display.instructorPubkey || '',
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
          price: video.price,
          isPremium: video.price > 0,
          rating: 4.5,
          published: true,
          topics: display.topics,
          additionalLinks: display.additionalLinks ?? [],
          noteId: video.note?.id || video.noteId,
          noteATag: getEventATag(video.note),
          purchases: video.purchases,
        }
        allItems.push(videoItem)
      })
    }

    if (documents) {
      documents.forEach(document => {
        const parsedDocument = document.note ? parseEvent(document.note) : null
        const display = parsedDocument
          ? createResourceDisplay(document, parsedDocument)
          : {
              title: `Document ${document.id}`,
              description: '',
              image: '',
              instructor: '',
              instructorPubkey: document.user?.pubkey || document.userId,
              topics: [] as string[],
              additionalLinks: [],
            }
        const documentAuthor = resolvePreferredDisplayName({
          preferredNames: [display.instructor],
          user: document.user,
          pubkey: display.instructorPubkey || document.note?.pubkey || document.user?.pubkey || document.userId,
        })

        const documentItem = {
          id: document.id,
          type: 'document' as const,
          title: display.title,
          description: display.description,
          category: document.price > 0 ? pricing.premium : pricing.free,
          image: display.image || getNoteImage(document.note),
          tags: parsedDocument?.tags || [],
          instructor: documentAuthor,
          instructorPubkey: display.instructorPubkey || '',
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          price: document.price,
          isPremium: document.price > 0,
          rating: 4.5,
          published: true,
          topics: display.topics,
          additionalLinks: display.additionalLinks ?? [],
          noteId: document.note?.id || document.noteId,
          noteATag: getEventATag(document.note),
          purchases: document.purchases,
        }
        allItems.push(documentItem)
      })
    }

    return allItems
  }, [courses, videos, documents, pricing.free, pricing.premium])

  // Extract unique tags from actual content, sorted by frequency
  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>()
    const contentTypeNames = new Set(['course', 'video', 'document', 'courses', 'videos', 'documents'])

    contentItems.forEach(item => {
      item.topics.forEach(topic => {
        if (topic && topic.trim()) {
          const normalizedTag = topic.toLowerCase().trim()
          // Skip tags that match content type filters to avoid duplicates
          if (!contentTypeNames.has(normalizedTag)) {
            tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1)
          }
        }
      })
    })

    // Convert to array and sort by frequency (most common first)
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  }, [contentItems])
  const availableTagsSet = useMemo(
    () => new Set(availableTags.map((tag) => tag.toLowerCase())),
    [availableTags]
  )

  const normalizeFilterCategory = (
    filter: string
  ): "all" | "content_type" | "price_tier" | "user_tag" | "unknown" => {
    const normalizedFilter = filter.toLowerCase().trim()
    if (normalizedFilter === "all") return "all"
    if (CONTENT_TYPE_FILTER_SET.has(normalizedFilter)) return "content_type"
    if (normalizedFilter === "free" || normalizedFilter === "premium") return "price_tier"
    if (availableTagsSet.has(normalizedFilter)) return "user_tag"
    return "unknown"
  }

  const normalizeFilterKey = (filter: string): string => filter.toLowerCase().trim()

  // Filter content based on selected filters
  const filteredContent = useMemo(() => {
    if (selectedFilters.has('all') || selectedFilters.size === 0) {
      return contentItems
    }

    return contentItems.filter(item => {
      const itemAttributes = [
        item.type,
        item.category,
        ...item.topics.map(t => t.toLowerCase()),
        item.isPremium ? 'premium' : 'free'
      ]

      return Array.from(selectedFilters).some(filter =>
        itemAttributes.includes(filter.toLowerCase())
      )
    })
  }, [contentItems, selectedFilters])

  // Show loading state
  if (loading) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <ContentPageSkeleton />
        </Section>
      </MainLayout>
    )
  }

  const toggleFilter = (filter: string) => {
    const normalizedFilter = normalizeFilterKey(filter)
    const newFilters = new Set(selectedFilters)
    const filterWasSelected = selectedFilters.has(normalizedFilter)
    
    if (normalizedFilter === 'all') {
      setSelectedFilters(new Set(['all']))
    } else {
      newFilters.delete('all')
      if (newFilters.has(normalizedFilter)) {
        newFilters.delete(normalizedFilter)
      } else {
        newFilters.add(normalizedFilter)
      }
      
      if (newFilters.size === 0) {
        newFilters.add('all')
      }
      
      setSelectedFilters(newFilters)
    }

    trackEventSafe("content_filter_toggled", {
      filter: normalizeFilterCategory(normalizedFilter),
      was_selected: filterWasSelected,
      selected_count: normalizedFilter === 'all' ? 1 : newFilters.size,
    })
  }

  const clearAllFilters = () => {
    trackEventSafe("content_filters_cleared", {
      selected_count: selectedFilters.size,
    })
    setSelectedFilters(new Set(['all']))
  }

  return (
    <MainLayout>
      {/* Header Section */}
      <Section spacing="lg" className="border-b">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{contentLibrary.title}</h1>
            <p className="text-muted-foreground">
              {contentLibrary.description}
            </p>
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {getCopy('contentLibrary.resultsCounter', { count: filteredContent.length, total: contentItems.length })}
            </p>
            {selectedFilters.size > 1 || !selectedFilters.has('all') ? (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-2" />
                {contentLibrary.filters.clearFilters}
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      {/* Filter Tags */}
      <Section spacing="sm" className="border-b bg-secondary/20">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{contentLibrary.filters.label}</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {/* All filter */}
            <Badge
              variant={selectedFilters.has('all') ? 'default' : 'outline'}
              className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => toggleFilter('all')}
            >
              {contentLibrary.filters.allContent}
            </Badge>
            
            {/* Type filters */}
            <div key="type-filters" className="flex flex-wrap gap-2">
              {contentTypeFilters.map(({ type, icon: Icon, label }) => (
                <Badge
                  key={type}
                  variant={selectedFilters.has(type) ? 'default' : 'outline'}
                  className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter(type)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Badge>
              ))}
            </div>
            
            {/* Premium/Free filters */}
            <div key="premium-filters" className="flex flex-wrap gap-2">
              <Badge
                key="free"
                variant={selectedFilters.has('free') ? 'default' : 'outline'}
                className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleFilter('free')}
              >
                <Gift className="h-3 w-3 mr-1" />
                {pricing.free}
              </Badge>
              <Badge
                key="premium"
                variant={selectedFilters.has('premium') ? 'default' : 'outline'}
                className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleFilter('premium')}
              >
                <Crown className="h-3 w-3 mr-1" />
                {pricing.premium}
              </Badge>
            </div>

            {/* Dynamic tags from actual content */}
            {availableTags.length > 0 && (
              <div key="content-tags" className="flex flex-wrap gap-2">
                {availableTags.slice(0, 12).map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedFilters.has(tag) ? 'default' : 'outline'}
                    className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleFilter(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Content Grid */}
      <Section spacing="lg">
        {filteredContent.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{contentLibrary.emptyState.title}</h3>
            <p className="text-muted-foreground mb-4">
              {contentLibrary.emptyState.description}
            </p>
            <Button variant="outline" onClick={clearAllFilters}>
              {contentLibrary.emptyState.button}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContent.map((item) => (
              <ContentCard 
                key={item.id} 
                item={item} 
                variant="content"
                onTagClick={toggleFilter}
                showContentTypeTags={true}
                engagementMode="off"
              />
            ))}
          </div>
        )}
      </Section>
    </MainLayout>
  )
}
