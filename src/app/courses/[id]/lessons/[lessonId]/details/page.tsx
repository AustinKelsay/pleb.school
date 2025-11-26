'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { getEstimatedReadingTime, formatContentForDisplay, extractVideoBodyMarkdown } from '@/lib/content-utils'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
import { ZapThreads } from '@/components/ui/zap-threads'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { formatLinkLabel } from '@/lib/link-label'
import { useCourseQuery } from '@/hooks/useCoursesQuery'
import { useLessonsQuery, useLessonQuery } from '@/hooks/useLessonsQuery'
import { 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  User, 
  Calendar, 
  PlayCircle, 
  BookOpen, 
  Video, 
  FileText,
  RotateCcw,
  Eye
} from 'lucide-react'
import Link from 'next/link'
import { LessonWithResource } from '@/hooks/useLessonsQuery'
import { useNostr, type NormalizedProfile } from '@/hooks/useNostr'
import { useInteractions } from '@/hooks/useInteractions'
import { encodePublicKey } from 'snstr'
import { resolveUniversalId } from '@/lib/universal-router'
import { getRelays } from '@/lib/nostr-relays'
import { ViewsText } from '@/components/ui/views-text'

function resolveLessonVideoUrl(
  parsedVideoUrl: string | undefined,
  rawContent: string,
  type: string
): string | undefined {
  // Newer lessons ship a dedicated video URL via tags, so honor that first.
  if (type !== 'video') {
    return parsedVideoUrl?.trim() || undefined
  }

  if (parsedVideoUrl?.trim()) {
    return parsedVideoUrl.trim()
  }

  // Legacy lessons published before the videoUrl column stored the share link
  // directly in the markdown body. We scan for the first absolute URL so those
  // lessons continue to play without re-editing.
  const legacyMatch = rawContent.match(/https?:\/\/[^\s<>()\[\]"']+/i)
  if (!legacyMatch) {
    return undefined
  }

  return legacyMatch[0].replace(/[.,;)]+$/, '')
}

interface LessonDetailsPageProps {
  params: Promise<{
    id: string
    lessonId: string
  }>
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


/**
 * Loading component for lesson content
 */
function LessonContentSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-4/5"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



/**
 * Lesson navigation component
 */
function LessonNavigation({ 
  courseId, 
  currentLessonIndex, 
  lessons 
}: { 
  courseId: string
  currentLessonIndex: number
  lessons: LessonWithResource[]
}) {
  const prevLesson = currentLessonIndex > 0 ? lessons[currentLessonIndex - 1] : null
  const nextLesson = currentLessonIndex < lessons.length - 1 ? lessons[currentLessonIndex + 1] : null

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
      {prevLesson && (
        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
          <Link href={`/courses/${courseId}/lessons/${prevLesson.id}/details`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Previous
          </Link>
        </Button>
      )}
      
      <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
        <Link href={`/courses/${courseId}`}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Back to Course
        </Link>
      </Button>
      
      {nextLesson && (
        <Button size="sm" className="w-full sm:w-auto" asChild>
          <Link href={`/courses/${courseId}/lessons/${nextLesson.id}/details`}>
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      )}
    </div>
  )
}

/**
 * Client component for displaying instructor with profile data
 */
function InstructorDisplay({ instructorPubkey, fallbackName }: { instructorPubkey?: string; fallbackName: string }) {
  const { fetchProfile, normalizeKind0 } = useNostr()
  const [instructorProfile, setInstructorProfile] = useState<NormalizedProfile | null>(null)

  useEffect(() => {
    const fetchInstructorProfile = async () => {
      if (instructorPubkey) {
        try {
          const profileEvent = await fetchProfile(instructorPubkey)
          const normalizedProfile = normalizeKind0(profileEvent)
          setInstructorProfile(normalizedProfile)
        } catch (error) {
          console.error('Error fetching instructor profile:', error)
        }
      }
    }

    fetchInstructorProfile()
  }, [instructorPubkey, fetchProfile, normalizeKind0])

  const displayName = instructorProfile?.name || 
                      instructorProfile?.display_name || 
                      fallbackName || 
                      (instructorPubkey ? formatNpubWithEllipsis(instructorPubkey) : 'Unknown')

  return (
    <div className="flex items-center space-x-1">
      <User className="h-4 w-4" />
      <span>{displayName}</span>
    </div>
  )
}

/**
 * Lesson metadata component
 */
function LessonMetadata({ 
  instructorPubkey, 
  instructorName,
  content, 
  lesson,
  duration
}: { 
  instructorPubkey: string
  instructorName: string
  content: { content: string; isMarkdown?: boolean }
  lesson: LessonWithResource
  duration?: string
}) {
  const readingTime = content?.isMarkdown ? getEstimatedReadingTime(content.content) : null
  const lessonNote = lesson.resource?.note
  const parsedLessonEvent = React.useMemo(() => {
    if (!lessonNote) {
      return null
    }
    try {
      return parseEvent(lessonNote)
    } catch (error) {
      console.error('Error parsing lesson note:', error)
      return null
    }
  }, [lessonNote])
  
  // Get real interaction data for the lesson resource if available
  const lessonEventId = lessonNote?.id
  const lessonEventKind = lessonNote?.kind
  const lessonEventPubkey = lessonNote?.pubkey
  const lessonEventIdentifier = parsedLessonEvent?.d
  const lightningAddress = (lesson.resource as any)?.user?.lud16 || undefined
  const {
    interactions,
    isLoadingZaps,
    isLoadingLikes,
    isLoadingComments,
    hasReacted,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats
  } = useInteractions({
    eventId: lessonEventId,
    realtime: false,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(lessonEventId)
  })

  
  // Use only real interaction data - no fallbacks
  const zapsCount = interactions.zaps
  const commentsCount = interactions.comments
  const likesCount = interactions.likes
  
  return (
    <div className="flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-muted-foreground">
      <InstructorDisplay instructorPubkey={instructorPubkey} fallbackName={instructorName} />
      
      <div className="flex items-center space-x-1">
        <Calendar className="h-4 w-4" />
        <span>Lesson {lesson.index + 1}</span>
      </div>
      
      {readingTime && (
        <div className="flex items-center space-x-1">
          <Clock className="h-4 w-4" />
          <span>{readingTime} min read</span>
        </div>
      )}
      
      {duration && (
        <div className="flex items-center space-x-1">
          <PlayCircle className="h-4 w-4" />
          <span>{duration}</span>
        </div>
      )}

      <div className="flex items-center space-x-1">
        <Eye className="h-4 w-4" />
        <ViewsText ns="lesson" id={lesson.id} notation="compact" />
      </div>
      
      {/* Engagement metrics */}
      <InteractionMetrics
        zapsCount={zapsCount}
        commentsCount={commentsCount}
        likesCount={likesCount}
        isLoadingZaps={isLoadingZaps}
        isLoadingComments={isLoadingComments}
        isLoadingLikes={isLoadingLikes}
        hasReacted={hasReacted}
        eventId={lessonEventId}
        eventKind={lessonEventKind}
        eventPubkey={lessonEventPubkey}
        eventIdentifier={lessonEventIdentifier}
        zapInsights={zapInsights}
        recentZaps={recentZaps}
        hasZappedWithLightning={hasZappedWithLightning}
        viewerZapTotalSats={viewerZapTotalSats}
        zapTarget={{
          pubkey: lessonEventPubkey || instructorPubkey,
          lightningAddress,
          name: instructorName
        }}
        compact
      />
    </div>
  )
}

/**
 * Lesson content component
 */
function LessonContent({ 
  courseId, 
  lessonId 
}: { 
  courseId: string
  lessonId: string 
}) {
  const resolvedCourse = React.useMemo(() => resolveUniversalId(courseId), [courseId])
  const resolvedLesson = React.useMemo(() => resolveUniversalId(lessonId), [lessonId])
  const resolvedCourseId = resolvedCourse?.resolvedId ?? ''
  const resolvedLessonId = resolvedLesson?.resolvedId ?? ''
  
  // Use the new hooks to fetch lesson and course data with Nostr integration
  const { lesson: lessonData, isLoading: lessonLoading, isError: lessonError } = useLessonQuery(resolvedLessonId)
  const { course: courseData, isLoading: courseLoading } = useCourseQuery(resolvedCourseId)
  const { lessons: lessonsData, isLoading: lessonsDataLoading } = useLessonsQuery(resolvedCourseId)

  const lessonDisplays = useMemo(() => lessonsData || [], [lessonsData])

  const fallbackLesson = useMemo(() => {
    return lessonDisplays.find(lesson => 
      lesson.id === resolvedLessonId || lesson.resource?.id === resolvedLessonId
    ) || null
  }, [lessonDisplays, resolvedLessonId])

  const lesson = lessonData ?? fallbackLesson

  const loading = lessonLoading || courseLoading || lessonsDataLoading

  if (!resolvedCourse || !resolvedLesson) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Unsupported identifier</p>
      </div>
    )
  }

  if (loading) {
    return <LessonContentSkeleton />
  }

  if (!lesson) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Lesson not found</p>
      </div>
    )
  }

  if (lessonError && !lessonData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Lesson not found</p>
      </div>
    )
  }

  if (!lesson.resource) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Lesson content not available</p>
      </div>
    )
  }

  // Parse data from database and Nostr notes
  let resourceTitle = 'Unknown Lesson'
  let resourceDescription = 'No description available'
  let resourceType = 'document'
  let resourceIsPremium = false
  let resourceAuthor = 'Unknown'
  let resourceAuthorPubkey = ''
  let resourceImage = ''
  let resourceTopics: string[] = []
  let resourceAdditionalLinks: string[] = []
  let resourceVideoUrl: string | undefined = lesson.resource.videoUrl || undefined

let courseTitle = 'Unknown Course'
let courseCategory = 'general'
let courseInstructorPubkey = ''

  // Start with database data
  resourceIsPremium = (lesson.resource.price ?? 0) > 0
  resourceAuthorPubkey = lesson.resource.userId
  const resourceUser = (lesson.resource as any)?.user
  const resourceAuthorLightning = resourceUser?.lud16 || undefined

  // Parse resource Nostr data if available
  if (lesson.resource.note) {
    try {
      const parsedResource = parseEvent(lesson.resource.note)
      resourceTitle = parsedResource.title || resourceTitle
      resourceDescription = parsedResource.summary || resourceDescription
      resourceType = parsedResource.type || resourceType
      resourceIsPremium = parsedResource.isPremium || resourceIsPremium
      resourceAuthor = parsedResource.author || resourceAuthor
      resourceAuthorPubkey = parsedResource.authorPubkey || resourceAuthorPubkey
      resourceImage = parsedResource.image || resourceImage
      resourceTopics = parsedResource.topics || resourceTopics
      resourceAdditionalLinks = parsedResource.additionalLinks || resourceAdditionalLinks
      resourceVideoUrl = parsedResource.videoUrl || resourceVideoUrl
    } catch (error) {
      console.error('Error parsing resource note:', error)
    }
  }

  // Parse course data if available
  if (courseData) {
    courseInstructorPubkey = courseData.userId
    
    if (courseData.note) {
      try {
        const parsedCourse = parseCourseEvent(courseData.note)
        courseTitle = parsedCourse.title || courseTitle
        courseCategory = parsedCourse.category || courseCategory
        courseInstructorPubkey = parsedCourse.instructorPubkey || courseInstructorPubkey
      } catch (error) {
        console.error('Error parsing course note:', error)
      }
    }
  }

  // Create mock resource content for now - in future this should come from the Nostr event content
  const mockResourceContent = {
    content: lesson.resource.note?.content || 'No content available',
    isMarkdown: true,
    type: resourceType as 'video' | 'document',
    hasVideo: resourceType === 'video',
    videoUrl: resourceType === 'video' ? resourceVideoUrl : undefined,
    title: resourceTitle,
    additionalLinks: resourceAdditionalLinks
  }

  const content = mockResourceContent
  
  if (!content) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Content not available</p>
      </div>
    )
  }

  const formattedContent = formatContentForDisplay(content.content)
  const playbackUrl = resolveLessonVideoUrl(content.videoUrl, content.content, content.type)
  const videoBodyMarkdown = content.type === 'video' ? extractVideoBodyMarkdown(content.content) : ''
  
  // Use enhanced lesson displays from useLessonsQuery hook
  const currentLessonIndex = lessonDisplays.findIndex(l => 
    l.id === lesson.id || l.resource?.id === resolvedLessonId
  )
  const safeLessonIndex = currentLessonIndex >= 0 ? currentLessonIndex : 0
  
  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />
      case 'guide':
        return <BookOpen className="h-4 w-4" />
      case 'tutorial':
        return <PlayCircle className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Course Context & Lesson Header */}
      <div className="space-y-4">
        {/* Course Context - Compact */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{courseTitle}</h3>
              <div className="text-sm text-muted-foreground">
                <InstructorDisplay instructorPubkey={courseInstructorPubkey} fallbackName="Unknown" />
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="capitalize">
              {courseCategory}
            </Badge>
            {/* TODO: Update ResourceActions to work with new data structure */}
            <div className="text-sm text-muted-foreground">
              {resourceIsPremium ? 'Premium' : 'Free'}
            </div>
          </div>
        </div>

        {/* Lesson Title & Badges */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getContentTypeIcon(resourceType)}
              <h1 className="text-2xl sm:text-3xl font-bold">{resourceTitle}</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="capitalize">
                {resourceType}
              </Badge>
              {resourceIsPremium && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  Premium
                </Badge>
              )}
            </div>
          </div>
          
          <LessonMetadata 
            instructorPubkey={resourceAuthorPubkey} 
            instructorName={resourceAuthor}
            content={content} 
            lesson={lesson}
            duration="30 min"
          />
        </div>
      </div>

      {/* Navigation & Progress - Compact */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <LessonNavigation 
                courseId={resolvedCourseId} 
                currentLessonIndex={safeLessonIndex} 
                lessons={lessonDisplays}
              />
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                Lesson {safeLessonIndex + 1} of {lessonDisplays.length}
              </div>
              <div className="w-32">
                <Progress value={((safeLessonIndex + 1) / Math.max(lessonDisplays.length, 1)) * 100} className="h-2" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {content.type === 'video' && content.hasVideo ? (
            <>
              <VideoPlayer
                content={content.content}
                title={content.title}
                url={playbackUrl}
                videoUrl={playbackUrl}
                duration="30 min"
                thumbnailUrl={resourceImage}
              />
              {videoBodyMarkdown && (
                <MarkdownRenderer content={videoBodyMarkdown} />
              )}
            </>
          ) : (
            <MarkdownRenderer content={formattedContent} />
          )}
        </div>
        
        {/* Lesson Sidebar */}
        <div className="space-y-4">
          {/* Course Lessons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Course Lessons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lessonDisplays.map((l, index) => {
                  const isActiveLesson = l.id === lesson.id || l.resource?.id === resolvedLessonId
                  return (
                  <div
                    key={l.id}
                    className={`flex items-center space-x-3 p-2 rounded-lg transition-colors cursor-pointer ${
                      isActiveLesson 
                        ? 'bg-primary/10 border border-primary/20' 
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isActiveLesson 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link 
                        href={`/courses/${resolvedCourseId}/lessons/${l.id}/details`}
                        className={`block text-sm truncate ${
                          isActiveLesson 
                            ? 'font-semibold' 
                            : 'hover:underline'
                        }`}
                      >
                        {l.title || `Lesson ${l.index + 1}`}
                      </Link>
                    </div>
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Additional Resources */}
      {content.additionalLinks && content.additionalLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BookOpen className="h-5 w-5" />
              <span>Additional Resources</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {content.additionalLinks.map((link, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-start"
                  asChild
                >
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    {formatLinkLabel(link)}
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Comments Section */}
      {lesson.resource?.note && (
        <div data-comments-section>
          <ZapThreads
            eventDetails={{
              identifier: lesson.resource.id,
              pubkey: lesson.resource.note.pubkey,
              kind: lesson.resource.note.kind,
              relays: getRelays('default')
            }}
            title="Comments"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Lesson details page with full content and course context
 */
export default function LessonDetailsPage({ params }: LessonDetailsPageProps) {
  const [courseId, setCourseId] = useState<string>('')
  const [lessonId, setLessonId] = useState<string>('')

  useEffect(() => {
    params.then(p => {
      setCourseId(p.id)
      setLessonId(p.lessonId)
    })
  }, [params])

  if (!courseId || !lessonId) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4"></div>
          </div>
        </Section>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Link href="/content" className="hover:text-foreground cursor-pointer">
              Content
            </Link>
            <span>•</span>
            <Link href={`/courses/${courseId}`} className="hover:text-foreground cursor-pointer">
              Course
            </Link>
            <span>•</span>
            <span>Lesson Details</span>
          </div>

          {/* Content */}
          <Suspense fallback={<LessonContentSkeleton />}>
            <LessonContent courseId={courseId} lessonId={lessonId} />
          </Suspense>
        </div>
      </Section>
    </MainLayout>
  )
} 
