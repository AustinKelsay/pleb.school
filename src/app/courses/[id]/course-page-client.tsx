'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  ExternalLink,
  Play,
  Tag
} from 'lucide-react'

import { MainLayout } from '@/components/layout/main-layout'
import { CourseDetailPageSkeleton } from '@/components/ui/app-skeleton'
import { Section } from '@/components/layout/section'
import { PurchaseActions } from '@/components/purchase/purchase-actions'
import { AdditionalLinksList } from '@/components/ui/additional-links-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpandableText } from '@/components/ui/expandable-text'
import { InteractionMetrics } from '@/components/ui/interaction-metrics'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { DeferredZapThreads } from '@/components/ui/deferred-zap-threads'
import { parseCourseEvent } from '@/data/types'
import { useCourseQuery } from '@/hooks/useCoursesQuery'
import { useIdleMount } from '@/hooks/useIdleMount'
import { useInteractions } from '@/hooks/useInteractions'
import { useLessonsQuery, type LessonWithResource } from '@/hooks/useLessonsQuery'
import { useProfileSummary } from '@/hooks/useProfileSummary'
import { useSession } from '@/hooks/useSession'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import { trackEventSafe } from '@/lib/analytics'
import { useCopy, getCopy } from '@/lib/copy'
import { getCourseIcon } from '@/lib/copy-icons'
import { extractNoteId } from '@/lib/nostr-events'
import { getRelays } from '@/lib/nostr-relays'
import { formatNoteIdentifier } from '@/lib/note-identifiers'
import { profileSummaryFromUser, resolvePreferredDisplayName } from '@/lib/profile-display'
import { extractRelayHintsFromDecodedData } from '@/lib/relay-hints'
import { resolveUniversalId } from '@/lib/universal-router'
import type { AdditionalLink } from '@/types/additional-links'

const EducationIcon = getCourseIcon('education')

interface CoursePageProps {
  courseId: string
}

/**
 * Course lessons component - now using lessons from props
 */

function CourseLessons({
  lessons,
  courseId,
  analyticsCourseId,
  hasAccess,
}: {
  lessons: LessonWithResource[]
  courseId: string
  analyticsCourseId: string
  hasAccess: boolean
}) {
  const { course } = useCopy()

  if (!lessons || lessons.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <EducationIcon className="h-5 w-5" />
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
            <EducationIcon className="h-4 w-4 sm:h-5 sm:w-5" />
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
              const lessonCardClassName = `group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                hasAccess
                  ? 'hover:bg-accent/50 cursor-pointer'
                  : 'cursor-not-allowed opacity-60'
              }`
              const lessonCardContent = (
                <>
                  <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-primary/20 text-xs sm:text-sm font-medium flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm sm:text-base">
                        {lessonTitle}
                      </h4>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {isPremium ? getCopy('pricing.premium') : getCopy('pricing.free')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium sm:flex-shrink-0 transition-colors ${
                      hasAccess
                        ? 'group-hover:border-primary/50 group-hover:text-primary'
                        : 'pointer-events-none text-muted-foreground'
                    }`}
                  >
                    <Play className="h-4 w-4" />
                    <span className="sm:inline">
                      {hasAccess ? getCopy('course.buttons.start') : 'Locked'}
                    </span>
                  </div>
                </>
              )

              if (!hasAccess) {
                return (
                  <div
                    key={lesson.id}
                    className={lessonCardClassName}
                    aria-disabled="true"
                  >
                    {lessonCardContent}
                  </div>
                )
              }

              return (
                <Link
                  key={lesson.id}
                  href={`/courses/${courseId}/lessons/${lesson.id}/details`}
                  className={lessonCardClassName}
                  onClick={() => {
                    trackEventSafe("course_lesson_started", {
                      course_id: analyticsCourseId,
                      lesson_id: lesson.id,
                      lesson_index: index + 1,
                    })
                  }}
                >
                  {lessonCardContent}
                </Link>
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
  const trackedCourseViewKeysRef = useRef<Set<string>>(new Set())
  const [purchaseStatusOverride, setPurchaseStatusOverride] = useState<boolean | null>(null)
  const { data: session } = useSession()
  const sessionUserId = session?.user?.id ?? null
  const { course } = useCopy()
  const socialReady = useIdleMount()
  
  const resolved = React.useMemo(() => resolveUniversalId(courseId), [courseId])
  const resolvedCourseId = resolved?.resolvedId
  const canonicalCourseId = resolvedCourseId ?? courseId
  const routeRelayHints = useMemo(
    () => extractRelayHintsFromDecodedData(resolved?.decodedData),
    [resolved?.decodedData]
  )

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
  const courseNote = courseData?.note
  const parsedCourseNote = useMemo(() => {
    if (!courseNote) return null

    try {
      return parseCourseEvent(courseNote)
    } catch (error) {
      console.error('Error parsing course note:', error)
      return null
    }
  }, [courseNote])
  const courseInstructorPubkey =
    parsedCourseNote?.instructorPubkey ||
    courseData?.user?.pubkey ||
    courseData?.note?.pubkey ||
    courseData?.userId ||
    null
  const { profile: instructorProfile } = useProfileSummary(
    courseInstructorPubkey,
    profileSummaryFromUser(courseData?.user),
    {
      enabled: socialReady && Boolean(courseInstructorPubkey)
    }
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
    realtime: true,
    relayHints: routeRelayHints,
    staleTime: 5 * 60 * 1000,
    enabled: socialReady && Boolean(noteId)
  })

  const loading = courseLoading || lessonsLoading

  useEffect(() => {
    setPurchaseStatusOverride(null)
  }, [resolvedCourseId, sessionUserId])

  useEffect(() => {
    if (!courseData || lessonsLoading) return
    const viewKey = `${canonicalCourseId}:${noteId ?? ''}`
    if (trackedCourseViewKeysRef.current.has(viewKey)) return

    trackEventSafe("course_detail_viewed", {
      course_id: canonicalCourseId,
      note_id: noteId,
      lesson_count: lessonsData.length,
      is_premium: (courseData.price ?? 0) > 0,
      price_sats: courseData.price ?? 0,
    })
    trackedCourseViewKeysRef.current.add(viewKey)
  }, [courseData, canonicalCourseId, noteId, lessonsData.length, lessonsLoading])

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
    return <CourseDetailPageSkeleton />
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
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Course not found</h1>
            <p className="text-muted-foreground">
              This course could not be loaded.
            </p>
          </div>
        </Section>
      </MainLayout>
    )
  }

  const id = resolvedCourseId
  const lessonCount = lessonsData.length

  // Parse data from database and Nostr note
  let title = 'Untitled course'
  let description = ''
  let category = 'general'
  let topics: string[] = []
  let additionalLinks: AdditionalLink[] = []
  let image: string | null = null
  let isPremium = false
  let currency = 'sats'

  const hasDbPrice = typeof courseData.price === 'number' && !Number.isNaN(courseData.price)
  isPremium = hasDbPrice ? (courseData.price ?? 0) > 0 : false
  const dbPrice = hasDbPrice ? courseData.price ?? 0 : null
  let nostrPrice = 0

  if (parsedCourseNote) {
    title = parsedCourseNote.title || title
    description = parsedCourseNote.description || description
    category = parsedCourseNote.category || category
    topics = parsedCourseNote.topics || topics
    additionalLinks = normalizeAdditionalLinks(parsedCourseNote.additionalLinks || additionalLinks)
    image =
      parsedCourseNote.image && parsedCourseNote.image !== '/placeholder.svg'
        ? parsedCourseNote.image
        : image
    isPremium = parsedCourseNote.isPremium || isPremium
    currency = parsedCourseNote.currency || currency
    if (parsedCourseNote.price) {
      const parsedPrice = Number(parsedCourseNote.price)
      if (Number.isFinite(parsedPrice)) {
        nostrPrice = parsedPrice
      }
    }
  }

  const serverPrice = typeof courseData?.price === 'number' ? courseData.price : null
  const priceUsed =
    serverPrice ??
    dbPrice ??
    (typeof nostrPrice === 'number' && Number.isFinite(nostrPrice) ? nostrPrice : null)
  const purchasedFromCourseData = Array.isArray(courseData?.purchases) && typeof priceUsed === 'number'
    ? courseData.purchases.some((purchase: any) => {
        const snapshot = purchase?.priceAtPurchase
        const snapshotValid =
          snapshot !== null &&
          snapshot !== undefined &&
          typeof snapshot === 'number' &&
          snapshot >= 0
        const required = snapshotValid
          ? Math.min(snapshot, priceUsed)
          : priceUsed
        return (purchase?.amountPaid ?? 0) >= (required ?? 0)
      })
    : false
  const serverPurchased = purchaseStatusOverride ?? purchasedFromCourseData
  const priceSats = priceUsed ?? 0
  isPremium = priceSats > 0

  const instructor = resolvePreferredDisplayName({
    profile: instructorProfile,
    preferredNames: [parsedCourseNote?.instructor],
    user: courseData.user,
    pubkey: courseInstructorPubkey,
  })
  const courseThreadIdentifier = courseData.note ? extractNoteId(courseData.note) : undefined
  const nostrIdentifier = formatNoteIdentifier(courseData.note, courseId)
  const nostrUrl = nostrIdentifier ? `https://njump.me/${nostrIdentifier}` : null
  
  // Use only real interaction data - no fallbacks
  const zapsCount = interactions.zaps
  const commentsCount = interactions.comments
  const likesCount = interactions.likes
  const notePubkey = courseData?.note?.pubkey
  const viewerZapTotal = viewerZapTotalSats ?? 0
  const isOwner = Boolean(sessionUserId && courseData.userId && sessionUserId === courseData.userId)
  // Access requires server-confirmed purchase - don't grant access based on client-side zap totals alone
  // The auto-claim flow in PurchaseCard will set serverPurchased=true after successful API claim
  const hasAccess = !isPremium || serverPurchased || isOwner

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
                <ExpandableText
                  text={description}
                  textClassName="text-lg text-muted-foreground"
                />
              </div>

              <div className="flex items-center flex-wrap gap-4 sm:gap-6">
                {socialReady && noteId && notePubkey && (
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
                      name: instructor,
                      relayHints: routeRelayHints
                    }}
                  />
                )}
                
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <span>{lessonCount} lessons</span>
                </div>

          </div>

          {isPremium && priceSats > 0 && (
          <PurchaseActions
            title={title}
            priceSats={priceSats}
            courseId={resolvedCourseId}
            eventId={noteId}
            eventKind={courseData?.note?.kind}
            eventIdentifier={parsedCourseNote?.d}
            eventPubkey={notePubkey}
            zapTarget={{
              pubkey: notePubkey,
              lightningAddress: instructorProfile?.lud16 || undefined,
              name: instructor,
              relayHints: routeRelayHints
            }}
            viewerZapTotalSats={viewerZapTotal}
            alreadyPurchased={hasAccess}
            zapInsights={zapInsights}
            recentZaps={recentZaps}
            viewerZapReceipts={viewerZapReceipts}
            onPurchaseComplete={() => {
              trackEventSafe("course_purchase_unlocked", {
                course_id: canonicalCourseId,
                note_id: noteId,
                price_sats: priceSats,
              })
              setPurchaseStatusOverride(true)
            }}
          />
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {hasAccess ? (
              <Button size="lg" className="bg-primary hover:bg-primary/90 w-full sm:w-auto" asChild>
                <Link
                  href={lessonsData.length > 0 ? `/courses/${id}/lessons/${lessonsData[0].id}/details` : `/courses/${id}`}
                  onClick={() => {
                    trackEventSafe("course_start_learning_clicked", {
                      course_id: canonicalCourseId,
                      has_lessons: lessonsData.length > 0,
                      first_lesson_id: lessonsData[0]?.id,
                    })
                  }}
                >
                  <EducationIcon className="h-5 w-5 mr-2" />
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
              <AdditionalLinksList links={additionalLinks} />
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
                      <EducationIcon className="h-10 w-10 text-primary" />
                    </div>
                    <p className="text-lg font-medium text-foreground">Course Preview</p>
                    <p className="text-sm text-muted-foreground capitalize">{category}</p>
                  </div>
                </div>
                
                {/* Overlay image if available */}
                {image ? (
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
                ) : null}
              </div>
            </div>
          </div>

          {/* Course Content */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CourseLessons
                lessons={lessonsData}
                courseId={id}
                analyticsCourseId={canonicalCourseId}
                hasAccess={hasAccess}
              />
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
                  <div>
                    <h4 className="font-semibold mb-2">Price</h4>
                    <p className="text-sm text-muted-foreground">
                      {priceSats > 0 ? `${priceSats.toLocaleString()} ${currency}` : 'Free'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Created</h4>
                    <p className="text-sm text-muted-foreground">
                      {courseData.createdAt ? formatDate(courseData.createdAt) : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Last Updated</h4>
                    <p className="text-sm text-muted-foreground">
                      {courseData.updatedAt ? formatDate(courseData.updatedAt) : 'Unknown'}
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
                        <a
                          href={nostrUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            trackEventSafe("course_nostr_link_clicked", {
                              course_id: canonicalCourseId,
                              note_id: noteId,
                            })
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open on Nostr
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
          
          {/* Comments Section */}
          {courseData.note && courseThreadIdentifier && (
            <div className="mt-8" data-comments-section>
              <DeferredZapThreads
                eventDetails={{
                  identifier: courseThreadIdentifier,
                  pubkey: courseData.note.pubkey,
                  kind: courseData.note.kind,
                  relays: routeRelayHints.length > 0 ? routeRelayHints : getRelays('default')
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

export default function CoursePageClient({ courseId }: CoursePageProps) {
  return <CoursePageContent courseId={courseId} />
}
