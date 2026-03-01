'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  ExternalLink,
  FileText,
  Filter,
  Edit,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Video as VideoIcon,
} from 'lucide-react'
import type { NostrEvent } from 'snstr'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { usePublishedContentQuery } from '@/hooks/usePublishedContentQuery'
import { useResourceNotes } from '@/hooks/useResourceNotes'
import { useCourseNotes } from '@/hooks/useCourseNotes'
import { useDeleteResourceMutation, useDeleteCourseMutation } from '@/hooks/usePublishedContentMutations'
import {
  parseEvent,
  parseCourseEvent,
  createResourceDisplay,
  createCourseDisplay,
  type Resource,
  type Course,
  type ParsedResourceEvent,
  type ParsedCourseEvent,
} from '@/data/types'
import DraftsClient from '@/app/drafts/drafts-client'
import { getNoteImage } from '@/lib/note-image'
import { formatNoteIdentifier } from '@/lib/note-identifiers'
import { extractVideoBodyMarkdown, isLikelyEncryptedContent } from '@/lib/content-utils'
import { EditPublishedResourceDialog, type ResourceEditData } from './edit-published-resource-dialog'
import { EditPublishedCourseDialog, type CourseEditData } from './edit-published-course-dialog'
import { normalizeAdditionalLinks } from '@/lib/additional-links'

type PublishedItemType = 'course' | 'video' | 'document'

type PublishedItemBase = {
  id: string
  type: PublishedItemType
  title: string
  summary: string
  price: number
  isPremium: boolean
  topics: string[]
  updatedAt: string
  createdAt: string
  href: string
  noteId?: string
  noteStatus?: 'synced' | 'missing'
  noteError?: string
  image?: string
  displayNoteId?: string
  note?: NostrEvent
}

type PublishedResourceItem = PublishedItemBase & {
  type: 'video' | 'document'
  entityKind: 'resource'
  record: Resource
  parsedResource?: ParsedResourceEvent
}

type PublishedCourseItem = PublishedItemBase & {
  type: 'course'
  entityKind: 'course'
  record: Course
  parsedCourse?: ParsedCourseEvent
}

type PublishedItem = PublishedResourceItem | PublishedCourseItem

function isResourceItem(item: PublishedItem): item is PublishedResourceItem {
  return item.entityKind === 'resource'
}

const EMPTY_RESOURCES: Resource[] = []
const EMPTY_COURSES: Course[] = []

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return 'just now'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)}d ago`
  if (diffSeconds < 31536000) return `${Math.floor(diffSeconds / 2592000)}mo ago`
  return `${Math.floor(diffSeconds / 31536000)}y ago`
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Not available'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatSats(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(amount)
}

function resolveImage(...sources: Array<string | undefined | null>): string | undefined {
  for (const source of sources) {
    if (typeof source === 'string' && source.trim().length > 0) {
      return source
    }
  }
  return undefined
}

function buildResourceItems(
  resources: Resource[],
  notesMap: ReturnType<typeof useResourceNotes>['notes']
): PublishedItem[] {
  return resources.map(resource => {
    const noteResult = notesMap.get(resource.id)
    const note = noteResult?.note
    const parsed = note ? parseEvent(note) : undefined
    const display = parsed ? createResourceDisplay(resource, parsed) : undefined
    const fallbackThumbnail =
      display?.type === 'video' && resource.videoId
        ? `https://img.youtube.com/vi/${resource.videoId}/hqdefault.jpg`
        : undefined
    const image = resolveImage(
      display?.image,
      parsed?.image,
      getNoteImage(note, fallbackThumbnail),
      fallbackThumbnail
    )

    return {
      id: resource.id,
      type: display?.type === 'video' ? 'video' : 'document',
      title: display?.title || parsed?.title || resource.noteId || 'Untitled resource',
      summary: display?.description || parsed?.summary || 'No summary available.',
      price: resource.price,
      isPremium: resource.price > 0,
      topics: display?.topics || parsed?.topics || [],
      updatedAt: resource.updatedAt,
      createdAt: resource.createdAt,
      href: `/content/${resource.id}`,
      noteId: resource.noteId || note?.id,
      noteStatus: note ? 'synced' : 'missing',
      noteError: noteResult?.noteError,
      image,
      displayNoteId: formatNoteIdentifier(note, resource.noteId || note?.id),
      entityKind: 'resource',
      record: resource,
      note,
      parsedResource: parsed,
    }
  })
}

function buildCourseItems(
  courses: Course[],
  notesMap: ReturnType<typeof useCourseNotes>['notes']
): PublishedItem[] {
  return courses.map(course => {
    const noteResult = notesMap.get(course.id)
    const note = noteResult?.note
    const parsed = note ? parseCourseEvent(note) : undefined
    const display = parsed ? createCourseDisplay(course, parsed) : undefined
    const image = resolveImage(display?.image, parsed?.image, getNoteImage(note))

    const courseItem: PublishedCourseItem = {
      id: course.id,
      type: 'course',
      title: display?.title || parsed?.title || course.noteId || 'Untitled course',
      summary: display?.description || parsed?.description || 'No description available.',
      price: course.price,
      isPremium: course.price > 0,
      topics: display?.topics || parsed?.topics || [],
      updatedAt: course.updatedAt,
      createdAt: course.createdAt,
      href: `/courses/${course.id}`,
      noteId: course.noteId || note?.id,
      noteStatus: note ? 'synced' : 'missing',
      noteError: noteResult?.noteError,
      image,
      displayNoteId: formatNoteIdentifier(note, course.noteId || note?.id),
      entityKind: 'course',
      record: course,
      note,
      parsedCourse: parsed,
    }

    return courseItem
  })
}

function buildResourceEditData(item: PublishedResourceItem): ResourceEditData {
  const parsed = item.parsedResource
  const topics = Array.from(
    new Set(
      (parsed?.topics ?? item.topics ?? [])
        .map(topic => topic.trim())
        .filter(Boolean)
    )
  ).filter(topic => {
    const lower = topic.toLowerCase()
    return lower !== 'video' && lower !== 'document'
  })

  const additionalLinks = normalizeAdditionalLinks(parsed?.additionalLinks ?? [])

  const parsedContent = parsed?.content ?? ''
  const content =
    item.type === 'video'
      ? extractVideoBodyMarkdown(parsedContent)
      : parsedContent
  const hasEncryptedContent = isLikelyEncryptedContent(content)

  const videoUrl =
    item.type === 'video'
      ? parsed?.videoUrl || item.record.videoUrl || undefined
      : undefined

  const image = parsed?.image || item.image
  const title = parsed?.title || item.title
  const summary = parsed?.summary || item.summary

  return {
    id: item.id,
    title,
    summary,
    content: hasEncryptedContent ? '' : content ?? '',
    originalContent: content ?? '',
    hasEncryptedContent,
    price: item.price,
    image: image ?? undefined,
    topics,
    additionalLinks,
    type: item.type,
    videoUrl,
    pubkey: item.note?.pubkey ?? parsed?.pubkey ?? undefined,
  }
}

function buildCourseEditData(item: PublishedCourseItem): CourseEditData {
  const parsed = item.parsedCourse
  const topics = Array.from(
    new Set(
      (parsed?.topics ?? item.topics ?? [])
        .map(topic => topic.trim())
        .filter(Boolean)
    )
  ).filter(topic => topic.toLowerCase() !== 'course')

  const image = parsed?.image || item.image
  const title = parsed?.title || item.title
  const summary = parsed?.description || item.summary
  const lessonCount =
    item.note?.tags?.reduce((count, tag) => (tag[0] === 'a' ? count + 1 : count), 0) ?? undefined
  const lessonReferences =
    item.note?.tags
      ?.map(tag => {
        if (tag[0] !== 'a' || !tag[1]) {
          return null
        }
        const parts = tag[1].split(':')
        if (parts.length < 3) {
          console.warn('Malformed lesson reference tag: insufficient parts', {
            rawTag: tag,
            tagValue: tag[1],
            partsCount: parts.length,
            reason: 'parts.length < 3',
          })
          return null
        }
        const [kindStr, pubkey, identifier] = parts
        if (!pubkey || !identifier) {
          console.warn('Malformed lesson reference tag: missing pubkey or identifier', {
            rawTag: tag,
            tagValue: tag[1],
            pubkey: pubkey || null,
            identifier: identifier || null,
            reason: !pubkey ? 'missing pubkey' : 'missing identifier',
          })
          return null
        }
        const kind = parseInt(kindStr, 10)
        const price = kind === 30402 ? 1 : 0
        return { resourceId: identifier, pubkey, price }
      })
      .filter(Boolean) ?? undefined

  return {
    id: item.id,
    title,
    summary,
    image: image ?? undefined,
    price: item.price,
    topics,
    lessonCount,
    pubkey: item.note?.pubkey ?? parsed?.pubkey ?? undefined,
    lessonReferences: lessonReferences as Array<{ resourceId: string; pubkey: string; price?: number }> | undefined,
  }
}

function PublishedContentView() {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'courses' | 'resources'>('all')

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: refetchPublished,
  } = usePublishedContentQuery({ type: 'all', limit: 200 })

  const resources = data?.resources ?? EMPTY_RESOURCES
  const courses = data?.courses ?? EMPTY_COURSES

  const resourceIds = useMemo(() => resources.map(resource => resource.id), [resources])
  const courseIds = useMemo(() => courses.map(course => course.id), [courses])

  const resourceNotes = useResourceNotes(resourceIds, {
    enabled: resourceIds.length > 0,
  })
  const courseNotes = useCourseNotes(courseIds, {
    enabled: courseIds.length > 0,
  })

  const combinedItems = useMemo(() => {
    const resourceItems = buildResourceItems(resources, resourceNotes.notes)
    const courseItems = buildCourseItems(courses, courseNotes.notes)
    return [...resourceItems, ...courseItems].sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [resources, courses, resourceNotes.notes, courseNotes.notes])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return combinedItems.filter(item => {
      const matchesType =
        filterType === 'all' ||
        (filterType === 'courses' && item.type === 'course') ||
        (filterType === 'resources' && item.type !== 'course')

      if (!matchesType) return false
      if (!query) return true

      const inTitle = item.title.toLowerCase().includes(query)
      const inSummary = item.summary.toLowerCase().includes(query)
      const inTopics = item.topics.some(topic => topic.toLowerCase().includes(query))

      return inTitle || inSummary || inTopics
    })
  }, [combinedItems, filterType, search])

  const stats = data?.stats
  const isNotesLoading = resourceNotes.isLoading || courseNotes.isLoading
  const combinedLoading = isLoading || isNotesLoading
  const combinedError = isError || resourceNotes.isError || courseNotes.isError
  const combinedErrorMessage =
    error?.message ||
    resourceNotes.error?.message ||
    courseNotes.error?.message ||
    'Failed to load published content'

  const refetchAll = () => {
    refetchPublished()
    resourceNotes.refetch()
    courseNotes.refetch()
  }

  const [resourceEditData, setResourceEditData] = useState<ResourceEditData | null>(null)
  const [isResourceDialogOpen, setResourceDialogOpen] = useState(false)
  const [courseEditData, setCourseEditData] = useState<CourseEditData | null>(null)
  const [isCourseDialogOpen, setCourseDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PublishedItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteResourceMutation = useDeleteResourceMutation()
  const deleteCourseMutation = useDeleteCourseMutation()
  const isDeleting = deleteResourceMutation.isPending || deleteCourseMutation.isPending
  const pendingDeleteIsResource = deleteTarget ? isResourceItem(deleteTarget) : false
  const pendingDeleteLabel = deleteTarget?.title ?? 'this item'

  const openEditorForItem = (item: PublishedItem) => {
    if (isResourceItem(item)) {
      setResourceEditData(buildResourceEditData(item))
      setResourceDialogOpen(true)
      return
    }

    setCourseEditData(buildCourseEditData(item))
    setCourseDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleteError(null)
    try {
      if (isResourceItem(deleteTarget)) {
        await deleteResourceMutation.mutateAsync({ id: deleteTarget.id })
      } else {
        await deleteCourseMutation.mutateAsync({ id: deleteTarget.id })
      }
      setDeleteTarget(null)
      refetchAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete content'
      setDeleteError(message)
    }
  }

  if (combinedLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading published content…</p>
        </div>
      </div>
    )
  }

  if (combinedError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load published content</CardTitle>
          <CardDescription>{combinedErrorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button onClick={refetchAll}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Published Resources</CardDescription>
            <CardTitle className="text-3xl font-semibold">
              {stats?.totalResources ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats
              ? `${stats.freeResources} free · ${stats.paidResources} paid`
              : 'No resources yet'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Published Courses</CardDescription>
            <CardTitle className="text-3xl font-semibold">
              {stats?.totalCourses ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats
              ? `${stats.freeCourses} free · ${stats.paidCourses} paid`
              : 'No courses yet'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Purchases</CardDescription>
            <CardTitle className="text-3xl font-semibold">
              {stats?.totalPurchases ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats?.totalPurchases
              ? 'Total sales across resources and courses'
              : 'No purchases recorded yet'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue (sats)</CardDescription>
            <CardTitle className="text-3xl font-semibold">
              {formatSats(stats?.totalRevenueSats ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Last updated {formatDate(stats?.lastUpdatedAt)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl font-semibold">Published Content</CardTitle>
              <CardDescription>
                Review and manage content that has already been published to Nostr.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={refetchAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by title, summary, or topic"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter:</span>
              <div className="flex items-center gap-1 rounded-md border bg-background p-1">
                <Button
                  variant={filterType === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterType('all')}
                >
                  All
                </Button>
                <Button
                  variant={filterType === 'resources' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterType('resources')}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Resources
                </Button>
                <Button
                  variant={filterType === 'courses' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterType('courses')}
                >
                  <BookOpen className="mr-1 h-4 w-4" />
                  Courses
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Filter className="h-10 w-10 text-muted-foreground/60" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No published content found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters, or publish new content from your drafts.
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href="/create?type=resource">Create Resource</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/create?type=course">Create Course</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map(item => {
                const Icon =
                  item.type === 'course' ? BookOpen : item.type === 'video' ? VideoIcon : FileText

                return (
                  <Card key={item.id} className="overflow-hidden border-muted-foreground/20">
                    <div className="relative aspect-video bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
                      {item.image ? (
                        <OptimizedImage
                          src={item.image}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 70vw, 480px"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Icon className="h-12 w-12 text-primary/60" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/90 to-transparent" />
                    </div>
                    <CardHeader className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {item.type}
                        </Badge>
                        <Badge variant={item.isPremium ? 'default' : 'outline'} className="capitalize">
                          {item.isPremium ? 'Paid' : 'Free'}
                        </Badge>
                        {item.noteStatus === 'missing' && (
                          <Badge variant="destructive">Nostr note unavailable</Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl font-semibold leading-tight">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-sm">
                        {item.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Updated {formatTimeAgo(item.updatedAt)}</span>
                          <Separator orientation="vertical" className="hidden h-4 md:flex" />
                          <span>Created {formatDate(item.createdAt)}</span>
                          {(item.displayNoteId || item.noteId) && (
                            <>
                              <Separator orientation="vertical" className="hidden h-4 md:flex" />
                              <span className="break-all text-xs">
                                Note ID: {item.displayNoteId || item.noteId}
                                {item.noteError ? ` (${item.noteError})` : ''}
                              </span>
                            </>
                          )}
                        </div>
                        {item.topics.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {item.topics.slice(0, 4).map(topic => (
                              <Badge key={topic} variant="outline">
                                #{topic}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditorForItem(item)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => {
                            setDeleteTarget(item)
                            setDeleteError(null)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                        <Button asChild size="sm">
                          <Link href={item.href}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View Published {item.type === 'course' ? 'Course' : 'Content'}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
    </CardContent>
      </Card>

      <EditPublishedResourceDialog
        open={isResourceDialogOpen}
        onOpenChange={open => {
          setResourceDialogOpen(open)
          if (!open) {
            setResourceEditData(null)
          }
        }}
        data={resourceEditData ?? undefined}
        onSuccess={refetchAll}
      />

      <EditPublishedCourseDialog
        open={isCourseDialogOpen}
        onOpenChange={open => {
          setCourseDialogOpen(open)
          if (!open) {
            setCourseEditData(null)
          }
        }}
        data={courseEditData ?? undefined}
        onSuccess={refetchAll}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={open => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeleteIsResource ? 'Delete published content?' : 'Delete published course?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteLabel} will be removed from our database so it no longer appears on the
              platform. The underlying Nostr event remains on relays, but users will no longer see it
              listed here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert className="border-destructive">
              <AlertDescription className="text-destructive">{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={event => {
                event.preventDefault()
                handleDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function AdminContentManager() {
  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('drafts')

  return (
    <Tabs value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)} className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="drafts">Drafts</TabsTrigger>
        <TabsTrigger value="published">Published</TabsTrigger>
      </TabsList>
      <TabsContent value="drafts">
        <DraftsClient />
      </TabsContent>
      <TabsContent value="published">
        <PublishedContentView />
      </TabsContent>
    </Tabs>
  )
}
