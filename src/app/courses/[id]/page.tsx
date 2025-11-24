'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useNostr, type NormalizedProfile } from '@/hooks/useNostr'
import { useCourseQuery } from '@/hooks/useCoursesQuery'
import { useLessonsQuery, type LessonWithResource } from '@/hooks/useLessonsQuery'
import { parseCourseEvent, parseEvent } from '@/data/types'
import { encodePublicKey } from 'snstr'
import { useCopy, getCopy } from '@/lib/copy'
import { ZapThreads } from '@/components/ui/zap-threads'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { useInteractions } from '@/hooks/useInteractions'
import { preserveLineBreaks } from '@/lib/text-utils'
import { resolveUniversalId } from '@/lib/universal-router'
import { 
  Clock, 
  BookOpen, 
  Play,
  Tag,
  ExternalLink,
  GraduationCap
} from 'lucide-react'
import { getRelays } from '@/lib/nostr-relays'
import { formatNoteIdentifier } from '@/lib/note-identifiers'
import { PurchaseActions } from '@/components/purchase/purchase-actions'
import { useSession } from 'next-auth/react'

interface CoursePageProps {
  params: {
    id: string
  }
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
 * Course lessons component - now using lessons from props
 */

function CourseLessons({ lessons, courseId }: { lessons: LessonWithResource[]; courseId: string }) {
  const { course } = useCopy()
  
  if (!lessons || lessons.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <GraduationCap className="h-5 w-5" />
              <span>{course.labels.courseContent}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <p className="text-muted-foreground">
                {course.emptyState.lessons}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
            <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>{course.labels.courseLessons}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-6">
          <div className="space-y-3 sm:space-y-4">
            {lessons.map((lesson, index) => {
              // Use enhanced lesson data from useLessonsQuery hook
              const lessonTitle = lesson.title || getCopy('lessons.lessonNumber', { index: lesson.index + 1 })
              const lessonDescription = lesson.description || getCopy('lessons.noDescription')
              const isPremium = lesson.isPremium || false

              return (
                <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-primary/20 text-xs sm:text-sm font-medium flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm sm:text-base">
                        {lessonTitle}
                      </h4>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span className="whitespace-nowrap">{lesson.duration || '30 min'}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {isPremium ? getCopy('pricing.premium') : getCopy('pricing.free')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto sm:flex-shrink-0" asChild>
                    <Link href={`/courses/${courseId}/lessons/${lesson.id}/details`}>
                      <Play className="h-4 w-4 mr-2" />
                      <span className="sm:inline">{getCopy('course.buttons.start')}</span>
                    </Link>
                  </Button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Course content component
 */
function CoursePageContent({ courseId }: { courseId: string }) {
  const { fetchProfile, normalizeKind0 } = useNostr()
  const { status: sessionStatus } = useSession()
  const [instructorProfile, setInstructorProfile] = useState<NormalizedProfile | null>(null)
  const [serverPrice, setServerPrice] = useState<number | null>(null)
  const [serverPurchased, setServerPurchased] = useState<boolean>(false)
  const { course, errors, pricing } = useCopy()
  
  const resolved = React.useMemo(() => resolveUniversalId(courseId), [courseId])
  const resolvedCourseId = resolved?.resolvedId

  // Use hooks to fetch course data and lessons with Nostr integration
  // Must be called unconditionally at the top level, before any early returns
  const { course: courseData, isLoading: courseLoading, isError, error } = useCourseQuery(
    resolvedCourseId || '',
    { enabled: !!resolvedCourseId }
  )
  const { lessons: lessonsData, isLoading: lessonsLoading } = useLessonsQuery(
    resolvedCourseId || '',
    { enabled: !!resolvedCourseId }
  )

  const noteATag = useMemo(() => {
    const note = courseData?.note
    if (!note || !note.kind || note.kind < 30000) return undefined
    if (!note.pubkey) return undefined
    const dTag = note.tags?.find((t: any) => Array.isArray(t) && t[0] === 'd')?.[1]
    if (!dTag) return undefined
    return `${note.kind}:${note.pubkey}:${dTag}`
  }, [courseData?.note])

  // Get real interaction data if course has a Nostr event - call hook unconditionally at top level
  const noteId = courseData?.note?.id
  const {
    interactions,
    isLoadingZaps,
    isLoadingLikes,
    isLoadingComments,
    hasReacted,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats,
    viewerZapReceipts
  } = useInteractions({
    eventId: noteId,
    eventATag: noteATag,
    realtime: false,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(noteId)
  })

  const loading = courseLoading || lessonsLoading

  useEffect(() => {
    const fetchCourseMeta = async () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(courseId)) return
      try {
        const res = await fetch(`/api/courses/${courseId}`)
        if (!res.ok) return
        const body = await res.json()
        const data = body?.course
        if (typeof data?.price === 'number') {
          setServerPrice(data.price)
        }
        if (Array.isArray(data?.purchases) && typeof data?.price === 'number') {
          const paid = data.purchases.some((p: any) => (p?.amountPaid ?? 0) >= data.price)
          setServerPurchased(paid)
        }
      } catch (err) {
        console.error('Failed to fetch course meta', err)
      }
    }

    if (sessionStatus !== 'loading') {
      fetchCourseMeta()
    }
  }, [courseId, sessionStatus])

  // useEffect must be called unconditionally before any early returns
  useEffect(() => {
    if (!courseData) return

    const fetchInstructorProfile = async () => {
      // Try to get instructor pubkey from multiple sources
      let instructorPubkey = courseData.userId // From database
      
      // If we have a Nostr note, try to get more instructor data
      if (courseData.note) {
        try {
          const parsedNote = parseCourseEvent(courseData.note)
          instructorPubkey = parsedNote.instructorPubkey || parsedNote.pubkey
        } catch (error) {
          console.error('Error parsing course note:', error)
        }
      }

      // Fetch instructor profile if available
      if (instructorPubkey) {
        try {
          const profileEvent = await fetchProfile(instructorPubkey)
          const normalizedProfile = normalizeKind0(profileEvent)
          setInstructorProfile(normalizedProfile)
        } catch (profileError) {
          console.error('Error fetching instructor profile:', profileError)
        }
      }
    }

    fetchInstructorProfile()
  }, [courseData, fetchProfile, normalizeKind0])

  // Early return check after all hooks (hooks must be called unconditionally)
  if (!resolvedCourseId) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <p className="text-destructive">
            Unsupported course identifier.
          </p>
        </Section>
      </MainLayout>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="h-4 bg-muted rounded"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
              </div>
              <div className="aspect-video bg-muted rounded-lg"></div>
            </div>
          </div>
        </Section>
      </MainLayout>
    )
  }

  if (isError) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Error Loading Course</h1>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'Failed to load course data'}
            </p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </Section>
      </MainLayout>
    )
  }

  if (!courseData) {
    notFound()
  }

  const id = courseId
  const lessonCount = lessonsData.length
  
  // Estimate total duration based on lesson count
  const estimatedDuration = lessonCount * 30 // 30 minutes per lesson

  // Parse data from database and Nostr note
  let title = 'Unknown Course'
  let description = 'No description available'
  let category = 'general'
  let topics: string[] = []
  let additionalLinks: string[] = []
  let image = '/placeholder.svg'
  let isPremium = false
  let currency = 'sats'
  let parsedCourseNote: ReturnType<typeof parseCourseEvent> | null = null

  // Start with database data (minimal Course type)
  const hasDbPrice = typeof courseData.price === 'number' && !Number.isNaN(courseData.price)
  isPremium = hasDbPrice ? (courseData.price ?? 0) > 0 : false
  const dbPrice = hasDbPrice ? courseData.price ?? 0 : null
  let nostrPrice = 0

  // If we have a Nostr note, use parsed data to enhance the information
  if (courseData.note) {
    try {
      const parsedNote = parseCourseEvent(courseData.note)
      parsedCourseNote = parsedNote
      title = parsedNote.title || title
      description = parsedNote.description || description
      category = parsedNote.category || category
      topics = parsedNote.topics || topics
      additionalLinks = parsedNote.additionalLinks || additionalLinks
      image = parsedNote.image || image
      isPremium = parsedNote.isPremium || isPremium
      currency = parsedNote.currency || currency
      if (parsedNote.price) {
        const parsedPrice = Number(parsedNote.price)
        if (Number.isFinite(parsedPrice)) {
          nostrPrice = parsedPrice
        }
      }
    } catch (error) {
      console.error('Error parsing course note:', error)
    }
  }

  const priceSats =
    serverPrice ?? dbPrice ?? nostrPrice ?? 0
  isPremium = priceSats > 0

  const instructor = instructorProfile?.name || 
                     instructorProfile?.display_name || 
                     (courseData.userId ? formatNpubWithEllipsis(courseData.userId) : 'Unknown')
  const nostrIdentifier = formatNoteIdentifier(courseData.note, courseId)
  const nostrUrl = nostrIdentifier ? `https://nostr.band/${nostrIdentifier}` : null
  
  // Use only real interaction data - no fallbacks
  const zapsCount = interactions.zaps
  const commentsCount = interactions.comments
  const likesCount = interactions.likes
  const notePubkey = courseData?.note?.pubkey
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const courseIdIsUuid = uuidRegex.test(courseId)
  const hasAccess = !isPremium || serverPurchased

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    return `${hours}h ${mins}m`
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-8">
          {/* Course Header */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {category}
                  </Badge>
                  <Badge variant="outline">
                    Course
                  </Badge>
                  {isPremium && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      Premium
                    </Badge>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{title}</h1>
                <p className="text-lg text-muted-foreground" style={preserveLineBreaks(description).style}>
                  {preserveLineBreaks(description).content}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-4 sm:gap-6">
                {noteId && notePubkey && (
                  <InteractionMetrics
                    zapsCount={zapsCount}
                    commentsCount={commentsCount}
                    likesCount={likesCount}
                    isLoadingZaps={isLoadingZaps}
                    isLoadingComments={isLoadingComments}
                    isLoadingLikes={isLoadingLikes}
                    hasReacted={hasReacted}
                    eventId={noteId}
                    eventKind={courseData?.note?.kind}
                    eventPubkey={notePubkey}
                    eventIdentifier={parsedCourseNote?.d}
                    zapInsights={zapInsights}
                    recentZaps={recentZaps}
                    hasZappedWithLightning={hasZappedWithLightning}
                    viewerZapTotalSats={viewerZapTotalSats}
                    zapTarget={{
                      pubkey: notePubkey,
                      lightningAddress: instructorProfile?.lud16 || undefined,
                      name: instructor
                    }}
                  />
                )}
                
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <span>{lessonCount} lessons</span>
                </div>

                {estimatedDuration > 0 && (
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span>{formatDuration(estimatedDuration)}</span>
              </div>
            )}
          </div>

          {isPremium && priceSats > 0 && (
          <PurchaseActions
            title={title}
            priceSats={priceSats}
            courseId={courseIdIsUuid ? courseId : undefined}
            eventId={noteId}
            eventKind={courseData?.note?.kind}
            eventIdentifier={parsedCourseNote?.d}
            eventPubkey={notePubkey}
            zapTarget={{
              pubkey: notePubkey,
              lightningAddress: instructorProfile?.lud16 || undefined,
              name: instructor
            }}
            viewerZapTotalSats={viewerZapTotalSats}
            alreadyPurchased={serverPurchased}
            zapInsights={zapInsights}
            recentZaps={recentZaps}
            viewerZapReceipts={viewerZapReceipts}
            onPurchaseComplete={() => {
              setServerPurchased(true)
            }}
          />
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {hasAccess ? (
              <Button size="lg" className="bg-primary hover:bg-primary/90 w-full sm:w-auto" asChild>
                <Link href={lessonsData.length > 0 ? `/courses/${id}/lessons/${lessonsData[0].id}/details` : `/courses/${id}`}>
                  <GraduationCap className="h-5 w-5 mr-2" />
                  Start Learning
                </Link>
              </Button>
            ) : (
              <Button size="lg" variant="outline" className="w-full sm:w-auto" disabled>
                Purchase required to access lessons
              </Button>
            )}
          </div>

              {/* Topics/Tags */}
              {topics && topics.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center">
                    <Tag className="h-4 w-4 mr-2" />
                    Topics
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Links */}
              {additionalLinks && additionalLinks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Additional Resources</h4>
                  <div className="space-y-2">
                    {additionalLinks.map((link: string, index: number) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        asChild
                      >
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Resource {index + 1}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
                {/* Background pattern for visual interest */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div 
                    className="absolute inset-0" 
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
                      backgroundSize: '20px 20px'
                    }}
                  />
                </div>
                
                {/* Always show the placeholder content */}
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                      <GraduationCap className="h-10 w-10 text-primary" />
                    </div>
                    <p className="text-lg font-medium text-foreground">Course Preview</p>
                    <p className="text-sm text-muted-foreground capitalize">{category}</p>
                  </div>
                </div>
                
                {/* Overlay image if available */}
                {image && (
                  <div className="absolute inset-0">
                    <OptimizedImage 
                      src={image} 
                      alt={title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      priority
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Course Content */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CourseLessons lessons={lessonsData} courseId={id} />
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>About this course</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Instructor</h4>
                    <p className="text-sm text-muted-foreground">{instructor}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Category</h4>
                    <p className="text-sm text-muted-foreground capitalize">{category}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Lessons</h4>
                    <p className="text-sm text-muted-foreground">{lessonCount} lessons</p>
                  </div>
                  {estimatedDuration > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Duration</h4>
                      <p className="text-sm text-muted-foreground">{formatDuration(estimatedDuration)}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold mb-2">Price</h4>
                    <p className="text-sm text-muted-foreground">
                      {(courseData.price ?? 0) > 0 ? `${(courseData.price ?? 0).toLocaleString()} ${currency}` : 'Free'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Created</h4>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(courseData.createdAt || new Date().toISOString())}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Last Updated</h4>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(courseData.updatedAt || new Date().toISOString())}
                    </p>
                  </div>
                  {courseData.submissionRequired && (
                    <div>
                      <h4 className="font-semibold mb-2">Requirements</h4>
                      <p className="text-sm text-muted-foreground">Submission required for completion</p>
                    </div>
                  )}
                  {nostrUrl && (
                    <div>
                      <Button variant="outline" className="w-full justify-center" asChild>
                        <a href={nostrUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in Nostr
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Related Courses */}
              <Card>
                <CardHeader>
                  <CardTitle>Related Courses</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    More courses from the same category and instructor coming soon.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
          
          {/* Comments Section */}
          {courseData.note && (
            <div className="mt-8" data-comments-section>
              <ZapThreads
                eventDetails={{
                  identifier: courseId,
                  pubkey: courseData.note.pubkey,
                  kind: courseData.note.kind,
                  relays: getRelays('default')
                }}
                title="Comments"
              />
            </div>
          )}
        </div>
      </Section>
    </MainLayout>
  )
}

/**
 * Course detail page with dynamic routing
 */
export default function CoursePage() {
  const params = useParams()
  const courseId = params?.id as string

  if (!courseId) {
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

  return <CoursePageContent courseId={courseId} />
}
