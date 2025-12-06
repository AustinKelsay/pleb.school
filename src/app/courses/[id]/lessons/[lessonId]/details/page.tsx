'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { formatContentForDisplay, extractVideoBodyMarkdown } from '@/lib/content-utils'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
import { ZapThreads } from '@/components/ui/zap-threads'
import { ResourceMetadataHero } from '@/app/content/components/resource-content-view'
import { useCourseQuery } from '@/hooks/useCoursesQuery'
import { useLessonsQuery, useLessonQuery } from '@/hooks/useLessonsQuery'
import { 
  ArrowLeft, 
  ArrowRight, 
  User, 
  BookOpen, 
  FileText,
  RotateCcw,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { LessonWithResource } from '@/hooks/useLessonsQuery'
import { useNostr, type NormalizedProfile } from '@/hooks/useNostr'
import { encodePublicKey } from 'snstr'
import { resolveUniversalId } from '@/lib/universal-router'
import { getRelays } from '@/lib/nostr-relays'
import { useCommentThreads } from '@/hooks/useCommentThreads'
import type { AdditionalLink } from '@/types/additional-links'
import { AdditionalLinksCard } from '@/components/ui/additional-links-card'

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
  const resourceNote = lesson?.resource?.note || null

  const loading = lessonLoading || courseLoading || lessonsDataLoading

  const resourceRequiresPurchase = Boolean((lesson?.resource as any)?.requiresPurchase)
  const resourceUnlockedViaCourse = Boolean((lesson?.resource as any)?.unlockedViaCourse)
  const resourcePurchased = !resourceRequiresPurchase || resourceUnlockedViaCourse

  const interactionData = useCommentThreads(resourceNote?.id, { enabled: Boolean(resourceNote?.id) && resourcePurchased })
  const [isFullWidth, setIsFullWidth] = useState(false)

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

  if (!resourcePurchased) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Premium lesson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              This lesson is locked. Purchase the course or unlock via your enrollment to view the content.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/courses/${resolvedCourseId}`}>
                  View Course
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Parse data from database and Nostr notes
  let resourceTitle = 'Unknown Lesson'
  let resourceType: string = 'document'
  let resourceIsPremium = false
  let resourceImage = ''
  let resourceAdditionalLinks: AdditionalLink[] = []
  let resourceVideoUrl: string | undefined = lesson.resource.videoUrl || undefined

let courseTitle = 'Unknown Course'
let courseCategory = 'general'
let courseInstructorPubkey = ''

  // Start with database data
  resourceIsPremium = (lesson.resource.price ?? 0) > 0
  const resourceId = lesson.resource.id

  let parsedResource: ReturnType<typeof parseEvent> | null = null

  // Parse resource Nostr data if available
  if (resourceNote) {
    try {
      parsedResource = parseEvent(resourceNote)
      resourceTitle = parsedResource.title || resourceTitle
      resourceType = parsedResource.type || resourceType
      resourceIsPremium = parsedResource.isPremium || resourceIsPremium
      resourceImage = parsedResource.image || resourceImage
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
  const prevLesson = safeLessonIndex > 0 ? lessonDisplays[safeLessonIndex - 1] : null
  const nextLesson = safeLessonIndex < lessonDisplays.length - 1 ? lessonDisplays[safeLessonIndex + 1] : null
  const nostrUrl = resourceNote?.id ? `https://nostr.band/${resourceNote.id}` : null

  const heroNavCtas = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {prevLesson && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/courses/${resolvedCourseId}/lessons/${prevLesson.id}/details`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Previous
          </Link>
        </Button>
      )}
      <Button variant="outline" size="sm" asChild>
        <Link href={`/courses/${resolvedCourseId}`}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Course
        </Link>
      </Button>
      <div className="px-3 py-1 rounded-full bg-background/70 text-sm font-medium text-foreground/80">
        Lesson {safeLessonIndex + 1} of {Math.max(lessonDisplays.length, 1)}
      </div>
      {nextLesson && (
        <Button size="sm" className="bg-primary text-primary-foreground" asChild>
          <Link href={`/courses/${resolvedCourseId}/lessons/${nextLesson.id}/details`}>
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      )}
    </div>
  )

  const heroBottomCta = nostrUrl ? (
    <Button variant="outline" size="sm" className="flex items-center" asChild>
      <a href={nostrUrl} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-4 w-4 mr-2" />
        Open on Nostr
      </a>
    </Button>
  ) : null
  
  return (
    <div className="space-y-6">
      {parsedResource && resourceNote ? (
        <ResourceMetadataHero
          event={resourceNote}
          parsedEvent={parsedResource}
          resourceId={resourceId}
          serverPrice={lesson.resource.price ?? null}
          serverPurchased={resourcePurchased}
          interactionData={interactionData}
          showBackLink
          backHref={`/courses/${resolvedCourseId}`}
          isPremium={resourceIsPremium}
          hidePrimaryCta
          rightCtas={heroNavCtas}
          bottomRightCta={heroBottomCta}
        />
      ) : (
        <Card>
          <CardContent className="py-4 flex justify-end">
            <div className="flex flex-col gap-2 items-end">
              {heroNavCtas}
              {heroBottomCta}
            </div>
          </CardContent>
        </Card>
      )}

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

      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setIsFullWidth(prev => !prev)}>
          {isFullWidth ? (
            <>
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Full Width
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4 mr-2" />
              Full Width
            </>
          )}
        </Button>
      </div>

      {/* Main Content */}
      <div className={`grid grid-cols-1 lg:grid-cols-4 gap-6 transition-all duration-300 ease-out`}>
        <div className={`${isFullWidth ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-6 transition-all duration-300 ease-out`}>
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
        <div className={`${isFullWidth ? 'lg:max-h-0 lg:opacity-0 lg:pointer-events-none lg:overflow-hidden lg:scale-95' : 'space-y-4 lg:opacity-100 lg:scale-100 lg:max-h-[2000px]'} transition-all duration-300 ease-out`}>
          {/* Course Lessons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Course Lessons</CardTitle>
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

          {!isFullWidth && (
            <AdditionalLinksCard links={content.additionalLinks} layout="stack" icon="file" />
          )}
        </div>
      </div>

      {/* Additional Resources */}
      {isFullWidth && <AdditionalLinksCard links={content.additionalLinks} icon="file" />}
      
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
