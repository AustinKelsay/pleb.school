'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DraftBadge, DraftPreviewBadge } from '@/components/ui/draft-badge'
import { DraftBanner, DraftActions } from '@/components/ui/draft-banner'
import { Progress } from '@/components/ui/progress'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
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
  Edit,
  Share,
  AlertTriangle,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { useCourseDraftQuery, type CourseDraft } from '@/hooks/useCourseDraftQuery'
import { useResourceNotes } from '@/hooks/useResourceNotes'
import {
  buildDraftLessonList,
  resolveDraftLesson,
  type DraftLessonListItem,
  type ResolveDraftLessonResult,
  type ResolvedDraftLesson,
} from '@/lib/drafts/lesson-resolution'
import { DraftLessonSkeleton } from '@/components/ui/app-skeleton-client'

interface LessonDraftPreviewPageClientProps {
  courseId: string
  lessonId: string
}

function DraftLessonNavigation({
  courseId,
  currentLessonIndex,
  lessons,
}: {
  courseId: string
  currentLessonIndex: number
  lessons: DraftLessonListItem[]
}) {
  const prevLesson = currentLessonIndex > 0 ? lessons[currentLessonIndex - 1] : null
  const nextLesson = currentLessonIndex < lessons.length - 1 ? lessons[currentLessonIndex + 1] : null

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
      {prevLesson && (
        <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
          <Link href={`/drafts/courses/${courseId}/lessons/${prevLesson.id}/preview`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Previous
          </Link>
        </Button>
      )}

      <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
        <Link href={`/drafts/courses/${courseId}`}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Back to Course Draft
        </Link>
      </Button>

      {nextLesson && (
        <Button size="sm" className="w-full sm:w-auto" asChild>
          <Link href={`/drafts/courses/${courseId}/lessons/${nextLesson.id}/preview`}>
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      )}
    </div>
  )
}

function DraftLessonMetadata({
  lessonData,
}: {
  lessonData: ResolvedDraftLesson
}) {
  const getReadingTime = (content: string | undefined): number | null => {
    if (!content) return null
    const words = content.trim().split(/\s+/).length
    if (!words) return null
    const wordsPerMinute = 200
    return Math.ceil(words / wordsPerMinute)
  }

  const readingTime =
    lessonData.type !== 'video' ? getReadingTime(lessonData.content) : null

  return (
    <div className="flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-muted-foreground">
      <div className="flex items-center space-x-1">
        <User className="h-4 w-4" />
        <span>{lessonData.author}</span>
      </div>

      <div className="flex items-center space-x-1">
        <Calendar className="h-4 w-4" />
        <span>Lesson {lessonData.index + 1}</span>
      </div>

      {readingTime && (
        <div className="flex items-center space-x-1">
          <Clock className="h-4 w-4" />
          <span>{readingTime} min read</span>
        </div>
      )}

      {lessonData.type === 'video' && lessonData.videoUrl && (
        <div className="flex items-center space-x-1">
          <PlayCircle className="h-4 w-4" />
          <span>Video lesson</span>
        </div>
      )}

      <DraftPreviewBadge />
    </div>
  )
}

function DraftLessonContent({
  courseDraft,
  lessonId,
  lessons,
  lessonData,
  contentNotice,
  isResourceLoading,
}: {
  courseDraft: CourseDraft
  lessonId: string
  lessons: DraftLessonListItem[]
  lessonData: ResolvedDraftLesson | null
  contentNotice?: string
  isResourceLoading: boolean
}) {
  if (isResourceLoading) {
    return <DraftLessonSkeleton />
  }

  if (!lessonData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Lesson data could not be found for this draft.</p>
      </div>
    )
  }

  const currentLessonIndex =
    lessons.findIndex(lesson => lesson.id === lessonId) ?? lessonData.index
  const effectiveLessonIndex =
    currentLessonIndex >= 0 ? currentLessonIndex : lessonData.index
  const courseCategory = courseDraft.topics?.[0] ?? 'Course'

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      <DraftBanner
        title="Lesson Draft Preview"
        description="This is exactly how your lesson will appear when the course is published."
        actions={(
          <DraftActions
            editHref={`/drafts/courses/${courseDraft.id}/lessons/${lessonId}/edit`}
            publishHref={`/drafts/courses/${courseDraft.id}/publish`}
          />
        )}
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{courseDraft.title}</h3>
              <div className="text-sm text-muted-foreground">Course Draft Preview</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="capitalize">
              {courseCategory}
            </Badge>
            <DraftBadge variant="outline" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getContentTypeIcon(lessonData.type)}
              <h1 className="text-2xl sm:text-3xl font-bold">{lessonData.title}</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="capitalize">
                {lessonData.type}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {lessonData.status === 'published' ? 'published' : 'draft'}
              </Badge>
              <Badge variant="outline">
                {lessonData.isPremium ? 'Premium' : 'Free'}
              </Badge>
              <DraftBadge variant="outline" />
            </div>
          </div>

          <DraftLessonMetadata lessonData={lessonData} />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-col gap-4 sm:flex-row sm:gap-6">
            <DraftLessonNavigation
              courseId={courseDraft.id}
              currentLessonIndex={effectiveLessonIndex}
              lessons={lessons}
            />
            <div className="flex items-center space-x-4 w-full sm:w-auto">
              <div className="text-sm text-muted-foreground">
                Lesson {effectiveLessonIndex + 1} of {lessons.length}
              </div>
              <div className="w-full sm:w-32">
                <Progress
                  value={((effectiveLessonIndex + 1) / Math.max(lessons.length, 1)) * 100}
                  className="h-2"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {contentNotice && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Content unavailable</AlertTitle>
          <AlertDescription>{contentNotice}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {lessonData.type === 'video' ? (
            <VideoPlayer
              content={lessonData.content}
              title={lessonData.title}
              videoUrl={lessonData.videoUrl}
            />
          ) : lessonData.content ? (
            <Card>
              <CardContent className="pt-6">
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer content={lessonData.content} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Lesson content is not available yet for this resource.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Course Lessons (Draft)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lessons.map(lesson => (
                  <div
                    key={lesson.id}
                    className={`flex items-center space-x-3 p-2 rounded-lg transition-colors cursor-pointer ${
                      lesson.id === lessonId
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          lesson.id === lessonId
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {lesson.index + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/drafts/courses/${courseDraft.id}/lessons/${lesson.id}/preview`}
                        className={`block text-sm truncate ${
                          lesson.id === lessonId ? 'font-semibold' : 'hover:underline'
                        }`}
                      >
                        {lesson.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{lesson.isPremium ? 'Premium' : 'Free'}</span>
                        <span>•</span>
                        <span>
                          {lesson.status === 'published'
                            ? 'Published resource'
                            : 'Draft resource'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Draft Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link href={`/drafts/courses/${courseDraft.id}/lessons/${lessonId}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Lesson
                </Link>
              </Button>

              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link href={`/drafts/courses/${courseDraft.id}/edit`}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Edit Course
                </Link>
              </Button>

              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link href={`/drafts/courses/${courseDraft.id}/publish`}>
                  <Share className="h-4 w-4 mr-2" />
                  Publish Course
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function LessonDraftPreviewPageClient({
  courseId,
  lessonId,
}: LessonDraftPreviewPageClientProps) {
  const { status: sessionStatus } = useSession()
  const router = useRouter()

  const {
    data: courseDraft,
    isLoading: draftLoading,
    isError,
    error,
  } = useCourseDraftQuery(courseId)

  const draftLessons = useMemo(
    () => courseDraft?.draftLessons ?? [],
    [courseDraft]
  )

  const resourceIds = useMemo(() => {
    if (!courseDraft) return [] as string[]
    const ids = draftLessons
      .map(lesson => lesson.resourceId ?? lesson.resource?.id)
      .filter((id): id is string => Boolean(id))
    return Array.from(new Set(ids))
  }, [courseDraft, draftLessons])

  const resourceNotesQuery = useResourceNotes(resourceIds, {
    enabled: resourceIds.length > 0 && sessionStatus === 'authenticated',
  })

  const selectedLesson = useMemo(
    () => draftLessons.find(lesson => lesson.id === lessonId),
    [draftLessons, lessonId]
  )

  const selectedResourceId = selectedLesson?.resourceId ?? selectedLesson?.resource?.id ?? null

  const selectedNoteResult = useMemo(() => {
    if (!selectedResourceId) return undefined
    return resourceNotesQuery.notes.get(selectedResourceId)
  }, [resourceNotesQuery.notes, selectedResourceId])

  const resolvedLessonResult = useMemo(() => {
    if (!courseDraft || !selectedLesson) return { data: null } as ResolveDraftLessonResult
    return resolveDraftLesson(courseDraft, selectedLesson, selectedNoteResult)
  }, [courseDraft, selectedLesson, selectedNoteResult])

  const lessonsList = useMemo(() => {
    if (!courseDraft) return [] as DraftLessonListItem[]
    return buildDraftLessonList(courseDraft, resourceNotesQuery.notes)
  }, [courseDraft, resourceNotesQuery.notes])

  const isResourceLoading =
    resourceNotesQuery.isLoading && Boolean(selectedResourceId)

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && draftLoading)) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <DraftLessonSkeleton />
        </Section>
      </MainLayout>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    router.push('/auth/signin')
    return null
  }

  if (isError) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Error loading lesson preview</h1>
            <p className="text-muted-foreground mb-4">{error?.message ?? 'Failed to load course draft.'}</p>
            <Button onClick={() => router.push('/drafts')}>Back to Drafts</Button>
          </div>
        </Section>
      </MainLayout>
    )
  }

  if (!courseDraft) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Course draft not found</h1>
            <Button onClick={() => router.push('/drafts')}>Back to Drafts</Button>
          </div>
        </Section>
      </MainLayout>
    )
  }

  if (!selectedLesson) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Lesson not found in this draft</h1>
            <Button onClick={() => router.push(`/drafts/courses/${courseId}`)}>Back to Course Draft</Button>
          </div>
        </Section>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Link href="/drafts" className="hover:text-foreground cursor-pointer">
              Drafts
            </Link>
            <span>•</span>
            <Link href={`/drafts/courses/${courseId}`} className="hover:text-foreground cursor-pointer">
              Course Draft
            </Link>
            <span>•</span>
            <span>Lesson Preview</span>
          </div>

          <DraftLessonContent
            courseDraft={courseDraft}
            lessonId={lessonId}
            lessons={lessonsList}
            lessonData={resolvedLessonResult.data}
            contentNotice={resolvedLessonResult.contentNotice}
            isResourceLoading={isResourceLoading}
          />
        </div>
      </Section>
    </MainLayout>
  )
}
