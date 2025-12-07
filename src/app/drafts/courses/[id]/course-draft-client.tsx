'use client'

import React, { useMemo, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DraftBadge, DraftPreviewBadge } from '@/components/ui/draft-badge'
import { DraftBanner, DraftActions } from '@/components/ui/draft-banner'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { preserveLineBreaks } from '@/lib/text-utils'
import { cn } from '@/lib/utils'
import { useCourseDraftQuery, useDeleteCourseDraft, type DraftLesson } from '@/hooks/useCourseDraftQuery'
import { useResourceNotes } from '@/hooks/useResourceNotes'
import {
  resolveDraftLesson,
  type ResolvedDraftLesson,
} from '@/lib/drafts/lesson-resolution'
import {
  Clock,
  BookOpen,
  Tag,
  Edit,
  Eye,
  Trash2,
  Share,
  FileText,
  Video,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
} from 'lucide-react'
import { getCourseIcon } from '@/lib/copy-icons'

const EducationIcon = getCourseIcon('education')
const PriceIcon = getCourseIcon('price')

interface CourseDraftPageClientProps {
  courseId: string
}

interface DraftCourseLessonDisplay extends ResolvedDraftLesson {
  noteError?: string
}

/**
 * Draft course lessons component
 */
function DraftCourseLessons({
  lessons,
  courseId,
  isSyncing,
  rawLessons,
}: {
  lessons: DraftCourseLessonDisplay[]
  courseId: string
  isSyncing: boolean
  rawLessons: DraftLesson[]
}) {
  const rawLessonMap = useMemo(() => {
    return new Map(rawLessons.map(lesson => [lesson.id, lesson]))
  }, [rawLessons])

  if (!lessons || lessons.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <EducationIcon className="h-5 w-5" />
              <span>Course Content (Draft)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <p className="text-muted-foreground">
                No lessons added yet. Add lessons to see them here.
              </p>
              <Button className="mt-4" asChild>
                <Link href={`/drafts/courses/${courseId}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Add Lessons
                </Link>
              </Button>
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
          <CardTitle className="flex items-center justify-between text-base sm:text-lg">
            <div className="flex items-center space-x-2">
              <EducationIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Course Lessons (Draft)</span>
            </div>
            <div className="flex items-center gap-2">
              {isSyncing && (
                <span className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Syncing lesson content…
                </span>
              )}
              <DraftPreviewBadge />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-6">
          <div className="space-y-3 sm:space-y-4">
            {lessons.map(lesson => {
              const rawLesson = rawLessonMap.get(lesson.id)
              const isPremium = (lesson.price || 0) > 0
              const contentType = lesson.type || rawLesson?.draft?.type || 'document'
              const isPublished = lesson.status === 'published'
              const StatusIcon = isPublished ? CheckCircle2 : Pencil
              const statusLabel = isPublished ? 'Published lesson' : 'Draft lesson'
              const statusBadgeVariant: React.ComponentProps<typeof Badge>['variant'] =
                isPublished ? 'outline' : 'draft-outline'
              const statusBadgeClassName = isPublished
                ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                : undefined

              const fallbackTitle =
                rawLesson?.draft?.title?.trim() ||
                rawLesson?.resource?.title?.trim() ||
                `Lesson ${lesson.index + 1}`
              const normalizedTitle = lesson.title?.trim()
              const displayTitle =
                normalizedTitle && normalizedTitle !== `Lesson ${lesson.index + 1}`
                  ? normalizedTitle
                  : fallbackTitle

              const trimmedSummary = lesson.summary?.trim() ?? ''
              const fallbackSummary =
                trimmedSummary.length > 0
                  ? trimmedSummary
                  : rawLesson?.draft?.summary || ''
              const displayImage = lesson.image || rawLesson?.draft?.image || null

              return (
                <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                    {/* Lesson Number */}
                    <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/20 text-sm sm:text-base font-medium flex-shrink-0">
                      {lesson.index + 1}
                    </div>
                    
                    {/* Lesson Thumbnail */}
                    <div className="relative w-16 h-12 bg-muted rounded-md flex-shrink-0 overflow-hidden">
                      {displayImage ? (
                        <OptimizedImage
                          src={displayImage}
                          alt={displayTitle}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {contentType === 'video' ? (
                            <Video className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium line-clamp-1 text-sm sm:text-base">
                        {displayTitle}
                      </h4>
                      {fallbackSummary ? (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {fallbackSummary}
                        </p>
                      ) : null}
                      {lesson.noteError && (
                        <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {lesson.noteError}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap mt-1">
                        {contentType && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {contentType}
                          </Badge>
                        )}
                        <Badge
                          variant={statusBadgeVariant}
                          className={cn('text-xs capitalize gap-1', statusBadgeClassName)}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusLabel}
                        </Badge>
                        {isPremium ? (
                          <Badge variant="secondary" className="text-xs">
                            <PriceIcon className="h-3 w-3 mr-0.5" />
                            {lesson.price?.toLocaleString()}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Free
                          </Badge>
                        )}
                        {!isPublished ? (
                          <DraftBadge variant="outline" className="text-xs flex-shrink-0" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto sm:flex-shrink-0" asChild>
                    <Link href={`/drafts/courses/${courseId}/lessons/${lesson.id}/preview`}>
                      <Eye className="h-4 w-4 mr-2" />
                      <span className="sm:inline">Preview</span>
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
 * Draft course actions component
 */
function DraftCourseActions({ courseId, onDelete }: { courseId: string; onDelete: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false)
  
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      setIsDeleting(true)
      onDelete()
    }
  }
  
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
      <Button size="lg" className="bg-primary hover:bg-primary/90 w-full sm:w-auto" asChild>
        <Link href={`/create?type=course&draft=${courseId}`}>
          <Edit className="h-5 w-5 mr-2" />
          Edit Draft
        </Link>
      </Button>
      
      <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
        <Link href={`/drafts/courses/${courseId}/publish`}>
          <Share className="h-5 w-5 mr-2" />
          Publish to Nostr
        </Link>
      </Button>
      
      <Button 
        size="lg" 
        variant="outline" 
        className="w-full sm:w-auto text-destructive border-destructive/50 hover:bg-destructive/10"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Deleting...
          </>
        ) : (
          <>
            <Trash2 className="h-5 w-5 mr-2" />
            Delete Draft
          </>
        )}
      </Button>
    </div>
  )
}

/**
 * Course draft page client component
 */
export function CourseDraftPageClient({ courseId }: CourseDraftPageClientProps) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const { data: draftData, isLoading: loading, isError, error } = useCourseDraftQuery(courseId)
  const { deleteCourseDraftAsync } = useDeleteCourseDraft()
  
  const handleDelete = async () => {
    try {
      await deleteCourseDraftAsync(courseId)
      router.push('/drafts')
    } catch (error) {
      console.error('Failed to delete draft:', error)
      alert('Failed to delete draft. Please try again.')
    }
  }

  const draftLessons = useMemo(() => draftData?.draftLessons ?? [], [draftData])

  const resourceIds = useMemo(() => {
    const ids = draftLessons
      .map(lesson => lesson.resourceId ?? lesson.resource?.id)
      .filter((id): id is string => Boolean(id))
    return Array.from(new Set(ids))
  }, [draftLessons])

  const resourceNotesQuery = useResourceNotes(resourceIds, {
    enabled: resourceIds.length > 0 && sessionStatus === 'authenticated',
  })

  const resolvedLessons: DraftCourseLessonDisplay[] = useMemo(() => {
    if (!draftData) return []

    return draftLessons
      .map(lesson => {
        const resourceId = lesson.resourceId ?? lesson.resource?.id ?? undefined
        const noteResult = resourceId ? resourceNotesQuery.notes.get(resourceId) : undefined
        const resolution = resolveDraftLesson(draftData, lesson, noteResult)
        if (!resolution.data) {
          return null
        }

        return {
          ...resolution.data,
          noteError: noteResult?.noteError,
        } as DraftCourseLessonDisplay
      })
      .filter((lesson): lesson is DraftCourseLessonDisplay => lesson !== null)
      .sort((a, b) => a.index - b.index)
  }, [draftData, draftLessons, resourceNotesQuery.notes])

  // Show loading state while session is loading or data is loading
  if (sessionStatus === 'loading' || (loading && sessionStatus === 'authenticated')) {
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
  
  // If not authenticated, redirect to sign in
  if (sessionStatus === 'unauthenticated') {
    router.push('/auth/signin')
    return null
  }

  if (isError) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Error Loading Draft</h1>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'Failed to load course draft'}
            </p>
            <Button onClick={() => router.push('/drafts')}>
              Back to Drafts
            </Button>
          </div>
        </Section>
      </MainLayout>
    )
  }

  // Only call notFound if we're authenticated and the query has completed
  if (!draftData && sessionStatus === 'authenticated' && !loading) {
    notFound()
  }
  
  // If we don't have data yet but we're authenticated, show loading
  if (!draftData) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/2 mb-8"></div>
          </div>
        </Section>
      </MainLayout>
    )
  }
  
  const title = draftData.title
  const description = draftData.summary
  const topics = draftData.topics
  const image = draftData.image
  const isPremium = (draftData.price ?? 0) > 0
  const currency = 'sats'
  const lessonCount = resolvedLessons.length
  const estimatedDuration = lessonCount * 30 // 30 minutes per lesson

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
          {/* Draft Warning Banner */}
          <DraftBanner
            title="Draft Preview"
            description="This is how your course will appear once published. Make changes or publish when ready."
            actions={
              <DraftActions
                editHref={`/drafts/courses/${courseId}/edit`}
                publishHref={`/drafts/courses/${courseId}/publish`}
                className="hidden lg:flex"
              />
            }
          />
          
          {/* Mobile Draft Actions */}
          <div className="lg:hidden">
            <DraftCourseActions courseId={courseId} onDelete={handleDelete} />
          </div>

          {/* Course Header */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-2">
                  {topics && topics.length > 0 && (
                    <Badge variant="secondary" className="capitalize">
                      {topics[0]}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    Course
                  </Badge>
                  {isPremium && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      Premium
                    </Badge>
                  )}
                  <DraftBadge variant="outline" />
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{title}</h1>
                <p className="text-lg text-muted-foreground" style={preserveLineBreaks(description).style}>
                  {preserveLineBreaks(description).content}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-4 sm:gap-6">
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

              <div className="hidden lg:block">
                <DraftCourseActions courseId={courseId} onDelete={handleDelete} />
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

                {/* Draft overlay indicator */}
                <div className="absolute top-4 right-4">
                  <DraftPreviewBadge className="bg-background/95 backdrop-blur-sm text-foreground border-border shadow-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Course Content */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DraftCourseLessons
                lessons={resolvedLessons}
                courseId={courseId}
                isSyncing={resourceNotesQuery.isLoading}
                rawLessons={draftLessons}
              />
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>About this course</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Status</h4>
                    <p className="text-sm text-muted-foreground">Draft - Not Published</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Category</h4>
                    <p className="text-sm text-muted-foreground capitalize">bitcoin</p>
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
                      {(draftData.price ?? 0) > 0 ? `${(draftData.price ?? 0).toLocaleString()} ${currency}` : 'Free'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Created</h4>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(draftData.createdAt)}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Last Updated</h4>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(draftData.updatedAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Draft Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Draft Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/create?type=course&draft=${courseId}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Course Details
                    </Link>
                  </Button>
                  
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/drafts/courses/${courseId}/lessons`}>
                      <BookOpen className="h-4 w-4 mr-2" />
                      Manage Lessons
                    </Link>
                  </Button>
                  
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/drafts/courses/${courseId}/publish`}>
                      <Share className="h-4 w-4 mr-2" />
                      Publish to Nostr
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}
