'use client'

import { useEffect, useMemo, useState } from 'react'
import React from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { useCourseDraftQuery, type CourseDraft } from '@/hooks/useCourseDraftQuery'
import { usePublishCourse } from '@/hooks/usePublishDraft'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Share,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Eye,
  BookOpen,
  Zap,
  CheckCircle2,
  Pencil
} from 'lucide-react'
import { getCourseIcon } from '@/lib/copy-icons'

const EducationIcon = getCourseIcon('education')

import { useResourceNotes } from '@/hooks/useResourceNotes'
import { resolveDraftLesson, type ResolvedDraftLesson } from '@/lib/drafts/lesson-resolution'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface CoursePublishPageClientProps {
  courseId: string
}

interface DraftLessonDisplay {
  id: string
  title: string
  index: number
  isPremium: boolean
  contentType?: string
  image?: string
  summary?: string
}

interface PublishStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  details?: string
  errorMessage?: string
}

/**
 * Publish status component
 */
function PublishStatus({ 
  steps, 
  currentStep, 
  onRetry 
}: { 
  steps: PublishStep[]
  currentStep: number
  onRetry: () => void
}) {
  const getStepIcon = (step: PublishStep) => {
    switch (step.status) {
      case 'completed':
        return <Check className="h-4 w-4 text-success" />
      case 'error':
        return <X className="h-4 w-4 text-destructive" />
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
    }
  }

  const getStepColor = (step: PublishStep) => {
    switch (step.status) {
      case 'completed':
        return 'border-success/20 bg-success/10'
      case 'error':
        return 'border-destructive/20 bg-destructive/10'
      case 'processing':
        return 'border-primary/20 bg-primary/10'
      default:
        return 'border-muted bg-background'
    }
  }

  const completedSteps = steps.filter(s => s.status === 'completed').length
  const totalSteps = steps.length
  const progressPercentage = (completedSteps / totalSteps) * 100

  const hasErrors = steps.some(s => s.status === 'error')
  const isComplete = steps.every(s => s.status === 'completed')

  return (
    <div className="space-y-6">
      {/* Progress overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Share className="h-5 w-5" />
            <span>Publishing Progress</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Step {Math.min(currentStep + 1, totalSteps)} of {totalSteps}</span>
              <span>{Math.round(progressPercentage)}% complete</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            
            {isComplete && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <Check className="h-5 w-5 text-success" />
                  <span className="text-success-foreground font-medium">
                    Successfully published course to Nostr!
                  </span>
                </div>
                <div className="flex items-center space-x-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Preparing your published course page...
                  </span>
                </div>
              </div>
            )}
            
            {hasErrors && (
              <div className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-destructive-foreground font-medium">Publishing failed</span>
                </div>
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step details */}
      <Card>
        <CardHeader>
          <CardTitle>Publishing Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className={`p-4 border rounded-lg ${getStepColor(step)}`}>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getStepIcon(step)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium">{step.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {step.description}
                    </p>
                    {step.details && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {step.details}
                      </p>
                    )}
                    {step.errorMessage && (
                      <p className="text-xs text-destructive mt-2">
                        Error: {step.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Course summary component
 */
function CourseSummary({ draftData, lessons }: { draftData: CourseDraft; lessons: ResolvedDraftLesson[] }) {
  const isPremium = (draftData.price ?? 0) > 0
  const lessonCount = lessons.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Course Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <EducationIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg">{draftData.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {draftData.summary}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <h4 className="font-medium text-sm">Lessons</h4>
            <p className="text-sm text-muted-foreground">{lessonCount} lessons</p>
          </div>
          <div>
            <h4 className="font-medium text-sm">Price</h4>
            <p className="text-sm text-muted-foreground">
              {isPremium ? `${(draftData.price ?? 0).toLocaleString()} sats` : 'Free'}
            </p>
          </div>
          <div>
            <h4 className="font-medium text-sm">Topics</h4>
            <div className="flex flex-wrap gap-1 mt-1">
              {draftData.topics.slice(0, 2).map((topic, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
              {draftData.topics.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{draftData.topics.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Lessons preview */}
        <div className="pt-4 border-t">
          <h4 className="font-medium text-sm mb-3">Lessons to be published</h4>
          <div className="space-y-2">
            {lessons.map(lesson => {
              const StatusIcon = lesson.status === 'published' ? CheckCircle2 : Pencil
              const statusLabel = lesson.status === 'published' ? 'Published lesson' : 'Draft lesson'
              const statusClass =
                lesson.status === 'published'
                  ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                  : 'bg-warning/15 text-warning-foreground border-warning/40 shadow-sm'

              return (
                <div key={lesson.id} className="flex items-center space-x-3 p-2 bg-muted/50 rounded-lg">
                  <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium">
                    {lesson.index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lesson.title}</p>
                    <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {lesson.isPremium ? 'Premium' : 'Free'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('text-xs capitalize gap-1', statusClass)}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Publish actions component
 */
function PublishActions({ 
  courseId, 
  isPublishing, 
  isComplete, 
  hasErrors,
  onStartPublish,
  publishedCourseId
}: { 
  courseId: string
  isPublishing: boolean
  isComplete: boolean
  hasErrors: boolean
  onStartPublish: () => void
  publishedCourseId?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isPublishing && !isComplete && (
          <Button 
            className="w-full" 
            onClick={onStartPublish}
            disabled={hasErrors || isPublishing}
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Share className="h-4 w-4 mr-2" />
                Publish Course to Nostr
              </>
            )}
          </Button>
        )}

        {isComplete && publishedCourseId && (
          <Button className="w-full" asChild>
            <Link href={`/courses/${publishedCourseId}`}>
              <Eye className="h-4 w-4 mr-2" />
              View Published Course
            </Link>
          </Button>
        )}

        <Button variant="outline" className="w-full" asChild>
          <Link href={`/drafts/courses/${courseId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Draft
          </Link>
        </Button>

        <Button variant="outline" className="w-full" asChild>
          <Link href={`/drafts/courses/${courseId}/edit`}>
            <BookOpen className="h-4 w-4 mr-2" />
            Edit Course
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Main publish page client component
 */
export function CoursePublishPageClient({ courseId }: CoursePublishPageClientProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session, status: sessionStatus } = useSession()
  const { data: draftData, isLoading, error } = useCourseDraftQuery(courseId)
  const publishMutation = usePublishCourse(courseId)
  const { publish, publishStatus, isSuccess, data: publishResult, isPending } = publishMutation
  const isPublishing = isPending || publishStatus.isPublishing
  const [publishedCourseId, setPublishedCourseId] = useState<string>()
  const resourceIds = useMemo(() => {
    if (!draftData) return []
    return draftData.draftLessons
      .map(lesson => lesson.resourceId ?? lesson.resource?.id ?? null)
      .filter((id): id is string => Boolean(id))
  }, [draftData])
  const resourceNotes = useResourceNotes(resourceIds, { enabled: resourceIds.length > 0 })
  const resolvedLessons = useMemo(() => {
    if (!draftData) return []
    
    return [...draftData.draftLessons]
      .sort((a, b) => a.index - b.index)
      .map(lesson => {
        const resourceId = lesson.resourceId ?? lesson.resource?.id ?? ''
        // Only use notes when loading is complete to avoid incomplete data
        const noteResult = (!resourceNotes.isLoading && resourceId) ? resourceNotes.notes.get(resourceId) : undefined
        const { data } = resolveDraftLesson(draftData, lesson, noteResult)
        if (data) {
          return data
        }
        const fallbackPrice = lesson.draft?.price ?? lesson.resource?.price ?? 0
        return {
          id: lesson.id,
          index: lesson.index,
          title: lesson.draft?.title || `Lesson ${lesson.index + 1}`,
          summary: lesson.draft?.summary,
          content: lesson.draft?.content,
          type: lesson.draft?.type || (lesson.resource?.videoUrl ? 'video' : 'document'),
          isPremium: fallbackPrice > 0,
          status: resourceId ? 'published' : 'draft',
          price: fallbackPrice,
          author: draftData.user?.username ?? undefined,
          authorPubkey: draftData.user?.pubkey ?? undefined,
          videoUrl: lesson.draft?.videoUrl ?? lesson.resource?.videoUrl ?? undefined,
          topics: lesson.draft?.topics ?? [],
          image: lesson.draft?.image ?? undefined,
          draftId: lesson.draftId ?? null,
          resourceId: resourceId || null,
        } satisfies ResolvedDraftLesson
      })
  }, [draftData, resourceNotes.notes, resourceNotes.isLoading])

  // Update published course ID when publish succeeds and redirect
  useEffect(() => {
    if (!isSuccess || !publishResult?.course?.id) {
      return
    }

    const publishedId = publishResult.course.id
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    setPublishedCourseId(publishedId)
    // Invalidate course queries to ensure fresh data
    queryClient.invalidateQueries({ queryKey: ['courses'] })
    queryClient.invalidateQueries({ queryKey: ['courses', 'detail', publishedId] })
    queryClient.invalidateQueries({ queryKey: ['drafts', 'courses', courseId] })

    /**
     * Polls for draft deletion with a maximum retry limit.
     * After maxAttempts (30 seconds), redirects to the published course anyway.
     */
    let attempts = 0
    const maxAttempts = 30 // 30 attempts = 30 seconds (1 second intervals)

    const pollForDeletion = async () => {
      if (cancelled) {
        return
      }

      attempts++

      if (cancelled) {
        return
      }

      // If we've reached max attempts, redirect anyway
      if (attempts >= maxAttempts) {
        console.warn(
          `Draft deletion polling reached max attempts (${maxAttempts}). ` +
          `Redirecting to published course anyway.`
        )
        if (!cancelled) {
          router.replace(`/courses/${publishedId}`)
        }
        return
      }

      try {
        const response = await fetch(`/api/drafts/courses/${courseId}`)
        if (cancelled) {
          return
        }
        if (response.status === 404) {
          if (!cancelled) {
            router.replace(`/courses/${publishedId}`)
          }
          return
        }
      } catch (pollError) {
        console.error('Failed to poll draft status:', pollError)
        // Continue polling on error unless we've hit max attempts
      }

      if (!cancelled && attempts < maxAttempts) {
        timeoutId = setTimeout(pollForDeletion, 1000)
      }
    }

    pollForDeletion()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isSuccess, publishResult, router, queryClient, courseId])

  const handleStartPublish = async () => {
    logger.debug('Starting course publish flow', {
      sessionStatus,
      provider: (session as { provider?: string })?.provider,
    })
    
    // Small delay to ensure window.nostr is available
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const nostrExtension = typeof window !== 'undefined' ? (window as { nostr?: unknown }).nostr : undefined
    if (nostrExtension) {
      logger.debug('NIP-07 extension detected on client')
    } else {
      logger.debug('No NIP-07 extension detected on client')
    }
    
    // Call the real publish function from the hook
    // Server-side flows use the stored server key; NIP-07 flows sign on the client
    publish()
  }

  const handleRetry = () => {
    // Reset the publish status and try again
    publishStatus.reset()
    publish()
  }

  // Show loading state while session is loading or data is loading
  if (sessionStatus === 'loading' || (isLoading && sessionStatus === 'authenticated')) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse space-y-8">
            <div className="space-y-4">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-8 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-48 bg-muted rounded"></div>
                <div className="h-96 bg-muted rounded"></div>
              </div>
              <div className="space-y-6">
                <div className="h-64 bg-muted rounded"></div>
                <div className="h-48 bg-muted rounded"></div>
              </div>
            </div>
          </div>
        </Section>
      </MainLayout>
    )
  }

  // If not authenticated, redirect to sign in
  if (sessionStatus === 'unauthenticated') {
    router.push('/auth/signin')
    return null
  }
  
  // Only call notFound if we're authenticated and the query has completed
  if ((error || !draftData) && sessionStatus === 'authenticated' && !isLoading) {
    notFound()
  }
  
  // If we don't have data yet but we're authenticated, show loading
  if (!draftData) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse space-y-8">
            <div className="space-y-4">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-8 bg-muted rounded w-3/4"></div>
            </div>
          </div>
        </Section>
      </MainLayout>
    )
  }

  const isComplete = publishStatus.steps.every(s => s.status === 'completed')
  const hasErrors = publishStatus.steps.some(s => s.status === 'error')

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Link href="/drafts" className="hover:text-foreground">
                Drafts
              </Link>
              <span>•</span>
              <Link href={`/drafts/courses/${courseId}`} className="hover:text-foreground">
                Course Draft
              </Link>
              <span>•</span>
              <span>Publish</span>
            </div>

            <div>
              <h1 className="text-3xl font-bold">Publish Course to Nostr</h1>
              <p className="text-muted-foreground">
                Convert your course draft to published Nostr events that will be accessible to everyone
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <PublishStatus 
                steps={publishStatus.steps}
                currentStep={publishStatus.currentStep}
                onRetry={handleRetry}
              />
            </div>

            <div className="space-y-6">
              <CourseSummary draftData={draftData} lessons={resolvedLessons} />
              
              <PublishActions 
                courseId={courseId}
                isPublishing={isPublishing}
                isComplete={isComplete}
                hasErrors={hasErrors}
                onStartPublish={handleStartPublish}
                publishedCourseId={publishedCourseId}
              />

              {/* Nostr info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Zap className="h-5 w-5" />
                    <span>About Nostr Publishing</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Your course will be published as multiple Nostr events:
                  </p>
                  <ul className="text-xs space-y-1 ml-4 list-disc">
                    <li>Course list event (NIP-51, kind 30004)</li>
                    <li>Individual lesson events (NIP-23, kind 30023)</li>
                    <li>Course metadata and structure</li>
                  </ul>
                  <p>
                    Once published, your course will be permanently stored and accessible through Nostr relays worldwide.
                  </p>
                  <p>
                    The draft will be removed after successful publishing.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}
