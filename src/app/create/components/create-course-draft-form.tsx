'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { 
  X, 
  AlertCircle, 
  CheckCircle, 
  BookOpen,
  Image,
  DollarSign,
  Tag,
  Plus,
  Loader2,
  FileText,
  Video,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import LessonSelector from './lesson-selector'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useResourceNotes, type ResourceNoteResult } from '@/hooks/useResourceNotes'
import { resolveDraftLesson } from '@/lib/drafts/lesson-resolution'
import type { CourseDraft as CourseDraftType, DraftLesson as DraftLessonType } from '@/hooks/useCourseDraftQuery'

interface FormData {
  title: string
  summary: string
  image: string
  price: number
  topics: string[]
}

interface LessonData {
  id: string
  type: 'resource' | 'draft'
  resourceId?: string
  draftId?: string
  title: string
  contentType?: string
  price?: number
  image?: string
  summary?: string
}

export default function CreateCourseDraftForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const draftId = searchParams.get('draft')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [courseDraftId, setCourseDraftId] = useState<string | null>(null)
  const [courseDraftData, setCourseDraftData] = useState<CourseDraftType | null>(null)
  const [isPaidCourse, setIsPaidCourse] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    title: '',
    summary: '',
    image: '',
    price: 0,
    topics: [],
  })
  
  // Lessons state
  const [lessons, setLessons] = useState<LessonData[]>([])
  const [hiddenLessons, setHiddenLessons] = useState<LessonData[]>([])
  const lessonsRef = useRef<LessonData[]>([])
  const hiddenLessonsRef = useRef<LessonData[]>([])
  const lastPaidPriceRef = useRef<number>(100)

  // Temporary input states
  const [currentTopic, setCurrentTopic] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const matchesPriceFor = useCallback((price: number | undefined, paid: boolean) => {
    const sats = typeof price === 'number' && !Number.isNaN(price) ? price : 0
    return paid ? sats > 0 : sats <= 0
  }, [])

  const matchesPriceFilter = useCallback((price?: number) => {
    return matchesPriceFor(price, isPaidCourse)
  }, [matchesPriceFor, isPaidCourse])

  const partitionLessons = useCallback((list: LessonData[], paid: boolean) => {
    const visible: LessonData[] = []
    const hidden: LessonData[] = []
    list.forEach((lesson) => {
      if (matchesPriceFor(lesson.price, paid)) {
        visible.push(lesson)
      } else {
        hidden.push(lesson)
      }
    })
    return { visible, hidden }
  }, [matchesPriceFor])

  useEffect(() => {
    lessonsRef.current = lessons
  }, [lessons])

  useEffect(() => {
    hiddenLessonsRef.current = hiddenLessons
  }, [hiddenLessons])

  const resourceIds = useMemo(() => {
    const ids = new Set<string>()
    lessons.forEach(lesson => {
      if (lesson.resourceId) {
        ids.add(lesson.resourceId)
      }
    })
    return Array.from(ids)
  }, [lessons])

  const { notes: resourceNotes } = useResourceNotes(resourceIds, {
    enabled: resourceIds.length > 0
  })

  const createLessonData = useCallback((
    draft: CourseDraftType,
    lesson: DraftLessonType,
    notesMap?: Map<string, ResourceNoteResult>
  ): LessonData => {
    const noteKey = lesson.resourceId ?? lesson.resource?.id ?? undefined
    const noteResult = noteKey && notesMap ? notesMap.get(noteKey) : undefined
    const { data } = resolveDraftLesson(draft, lesson, noteResult)

    return {
      id: lesson.id,
      type: (lesson.resourceId ?? lesson.resource?.id) ? 'resource' : 'draft',
      resourceId: lesson.resourceId ?? lesson.resource?.id ?? undefined,
      draftId: lesson.draftId ?? lesson.draft?.id ?? undefined,
      title:
        data?.title ||
        lesson.draft?.title ||
        (lesson.resourceId ? `Lesson ${lesson.index + 1}` : 'Untitled lesson'),
      contentType:
        data?.type ||
        lesson.draft?.type ||
        (lesson.resource?.videoUrl ? 'video' : undefined),
      price: data?.price ?? lesson.draft?.price ?? (lesson.resource?.price ?? undefined),
      image: data?.image ?? lesson.draft?.image ?? undefined,
      summary: data?.summary || lesson.draft?.summary || undefined
    }
  }, [])

  const handlePaidToggle = (checked: boolean) => {
    setIsPaidCourse(checked)
    const combined = [...lessons, ...hiddenLessons]
    const { visible, hidden } = partitionLessons(combined, checked)
    setLessons(visible)
    setHiddenLessons(hidden)
    setFormData((prev) => {
      if (!checked && prev.price > 0) {
        lastPaidPriceRef.current = prev.price
      }
      const nextPrice = checked
        ? (prev.price > 0 ? prev.price : lastPaidPriceRef.current)
        : 0
      return { ...prev, price: nextPrice }
    })
  }

  // Load draft data if editing
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) return
      
      setIsLoading(true)
      try {
        const response = await fetch(`/api/drafts/courses/${draftId}`)
        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to load draft')
        }
        
        const draft = result.data
        setCourseDraftId(draft.id)
        setCourseDraftData(draft)
        setFormData({
          title: draft.title,
          summary: draft.summary,
          image: draft.image || '',
          price: draft.price || 0,
          topics: draft.topics || [],
        })
        const paid = (draft.price ?? 0) > 0
        if (paid && typeof draft.price === 'number' && draft.price > 0) {
          lastPaidPriceRef.current = draft.price
        }
        setIsPaidCourse(paid)
        
        // Load lessons and partition by pricing mode so we can restore on toggle
        const draftLessons: DraftLessonType[] = draft.draftLessons || []
        if (draftLessons.length > 0) {
          const loadedLessons: LessonData[] = draftLessons.map((lesson: DraftLessonType) =>
            createLessonData(draft, lesson)
          )
          const { visible, hidden } = partitionLessons(loadedLessons, paid)
          setLessons(visible)
          setHiddenLessons(hidden)
        } else {
          setLessons([])
          setHiddenLessons([])
        }
      } catch (err) {
        console.error('Error loading draft:', err)
        setMessage({ 
          type: 'error', 
          text: err instanceof Error ? err.message : 'Failed to load draft' 
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadDraft()
  }, [draftId, createLessonData, partitionLessons])

  useEffect(() => {
    if (!courseDraftData) {
      return
    }

    const draftLessons = courseDraftData.draftLessons || []
    // Only clear when the server draft actually has zero lessons AND we haven't staged any local ones.
    if (draftLessons.length === 0) {
      if (!lessonsRef.current.length && !hiddenLessonsRef.current.length) {
        setLessons([])
        setHiddenLessons([])
      }
      return
    }

    const resolvedLessons = draftLessons.map(draftLesson =>
      createLessonData(courseDraftData, draftLesson, resourceNotes)
    )

    const combined = [...lessonsRef.current, ...hiddenLessonsRef.current]
    const resolvedMap = new Map(resolvedLessons.map((l) => [l.id, l]))

    const merged: LessonData[] = []

    combined.forEach((existing) => {
      const update = resolvedMap.get(existing.id)
      if (update) {
        resolvedMap.delete(existing.id)
        const shouldReplace =
          existing.title !== update.title ||
          existing.summary !== update.summary ||
          existing.contentType !== update.contentType ||
          (existing.price ?? 0) !== (update.price ?? 0) ||
          existing.image !== update.image ||
          existing.type !== update.type ||
          existing.resourceId !== update.resourceId ||
          existing.draftId !== update.draftId

        merged.push(shouldReplace ? { ...existing, ...update } : existing)
      } else {
        merged.push(existing)
      }
    })

    resolvedMap.forEach((lesson) => {
      merged.push(lesson)
    })

    const { visible, hidden } = partitionLessons(merged, isPaidCourse)

    const sameVisible =
      visible.length === lessonsRef.current.length &&
      visible.every((l, idx) => l === lessonsRef.current[idx])

    const sameHidden =
      hidden.length === hiddenLessonsRef.current.length &&
      hidden.every((l, idx) => l === hiddenLessonsRef.current[idx])

    if (!sameVisible) {
      lessonsRef.current = visible
      setLessons(visible)
    }
    if (!sameHidden) {
      hiddenLessonsRef.current = hidden
      setHiddenLessons(hidden)
    }
  }, [courseDraftData, resourceNotes, createLessonData, partitionLessons, isPaidCourse])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    } else if (formData.title.length > 200) {
      newErrors.title = 'Title must be less than 200 characters'
    }
    
    if (!formData.summary.trim()) {
      newErrors.summary = 'Summary is required'
    } else if (formData.summary.length > 1000) {
      newErrors.summary = 'Summary must be less than 1000 characters'
    }
    
    if (formData.image && !isValidUrl(formData.image)) {
      newErrors.image = 'Must be a valid URL'
    }
    
    if (formData.price < 0) {
      newErrors.price = 'Price must be 0 or greater'
    }
    if (isPaidCourse && formData.price <= 0) {
      newErrors.price = 'Paid courses must have a price above 0 sats'
    }
    
    if (formData.topics.length === 0) {
      newErrors.topics = 'At least one topic is required'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const addTopic = () => {
    if (currentTopic.trim() && !formData.topics.includes(currentTopic.trim())) {
      setFormData(prev => ({
        ...prev,
        topics: [...prev.topics, currentTopic.trim()]
      }))
      setCurrentTopic('')
      setErrors(prev => ({ ...prev, topics: undefined }))
    }
  }

  const removeTopic = (index: number) => {
    setFormData(prev => ({
      ...prev,
      topics: prev.topics.filter((_, i) => i !== index)
    }))
  }

  const handleAddLessons = (selectedLessons: LessonData[]) => {
    const filtered = selectedLessons.filter((lesson) => matchesPriceFilter(lesson.price))
    setLessons([...lessons, ...filtered])
  }

  const removeLesson = (index: number) => {
    const target = lessons[index]
    setLessons(lessons.filter((_, i) => i !== index))
    if (target) {
      setHiddenLessons((prev) => prev.filter((lesson) => lesson.id !== target.id))
    }
  }

  const moveLessonUp = (index: number) => {
    if (index === 0) return
    const newLessons = [...lessons]
    const temp = newLessons[index]
    newLessons[index] = newLessons[index - 1]
    newLessons[index - 1] = temp
    setLessons(newLessons)
  }

  const moveLessonDown = (index: number) => {
    if (index === lessons.length - 1) return
    const newLessons = [...lessons]
    const temp = newLessons[index]
    newLessons[index] = newLessons[index + 1]
    newLessons[index + 1] = temp
    setLessons(newLessons)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    setMessage(null)
    
    try {
      // Create or update course draft
      const courseUrl = draftId ? `/api/drafts/courses/${draftId}` : '/api/drafts/courses'
      const courseMethod = draftId ? 'PUT' : 'POST'
      
      const coursePayload = {
        ...formData,
        price: isPaidCourse ? formData.price : 0
      }

      const courseResponse = await fetch(courseUrl, {
        method: courseMethod,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(coursePayload),
      })

      if (!courseResponse.ok) {
        const error = await courseResponse.json()
        throw new Error(error.error || 'Failed to save course draft')
      }

      const courseResult = await courseResponse.json()
      const savedCourseDraftId = courseResult.data.id
      
      // If we have lessons, create draft lessons
      if (lessons.length > 0) {
        // First, delete existing lessons if updating
        if (draftId) {
          const existingLessonsResponse = await fetch(`/api/drafts/lessons?courseDraftId=${savedCourseDraftId}`)
          if (existingLessonsResponse.ok) {
            const existingLessons = await existingLessonsResponse.json()
            for (const lesson of existingLessons.data) {
              await fetch(`/api/drafts/lessons/${lesson.id}`, { method: 'DELETE' })
            }
          }
        }
        
        // Create new lessons
        for (let i = 0; i < lessons.length; i++) {
          const lesson = lessons[i]
          const lessonData = {
            courseDraftId: savedCourseDraftId,
            resourceId: lesson.resourceId,
            draftId: lesson.draftId,
            index: i
          }
          
          const lessonResponse = await fetch('/api/drafts/lessons', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(lessonData),
          })
          
          if (!lessonResponse.ok) {
            console.error('Failed to create lesson:', await lessonResponse.json())
          }
        }
      }
      
      setMessage({ 
        type: 'success', 
        text: draftId ? 'Course draft updated successfully! Redirecting...' : 'Course draft created successfully! Redirecting...' 
      })

      queryClient.invalidateQueries({ queryKey: ['drafts'] })
      
      setTimeout(() => {
        router.push(`/drafts/courses/${savedCourseDraftId}`)
      }, 1500)
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'An unexpected error occurred' 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2 text-muted-foreground">Loading draft...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message && (
        <Alert className={message.type === 'error' ? 'border-destructive' : 'border-success/30'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle className="h-4 w-4 text-success" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Course Information</CardTitle>
          <CardDescription>
            Provide the essential details about your course
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
            <div>
              <p className="text-sm font-medium">Course pricing mode</p>
              <p className="text-xs text-muted-foreground">
                Free courses can only include free lessons; paid courses only include paid lessons.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Free</span>
              <Switch checked={isPaidCourse} onCheckedChange={handlePaidToggle} />
              <span className="text-xs font-semibold text-primary">Paid</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter a descriptive course title"
              value={formData.title}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, title: e.target.value }))
                setErrors(prev => ({ ...prev, title: undefined }))
              }}
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">
              Summary
              <span className="text-sm text-muted-foreground ml-2">
                ({formData.summary.length}/1000)
              </span>
            </Label>
            <Textarea
              id="summary"
              placeholder="Provide a comprehensive summary of your course"
              className={`resize-none ${errors.summary ? 'border-destructive' : ''}`}
              rows={4}
              value={formData.summary}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, summary: e.target.value }))
                setErrors(prev => ({ ...prev, summary: undefined }))
              }}
            />
            {errors.summary && <p className="text-sm text-destructive">{errors.summary}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Course Lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Course Lessons</CardTitle>
        <CardDescription>
            Add and organize lessons for your course
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LessonSelector
            onAddLessons={handleAddLessons}
            existingLessons={[...lessons, ...hiddenLessons]}
            priceFilter={isPaidCourse ? 'paid' : 'free'}
          />
          
          {lessons.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Lessons</Label>
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                {lessons.map((lesson, index) => (
                  <div key={`${lesson.type}-${lesson.resourceId || lesson.draftId}-${index}`} 
                       className="flex items-center gap-3 p-3 bg-card rounded-lg border">
                    {/* Lesson Number */}
                    <div className="text-center">
                      <span className="text-2xl font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                    
                    {/* Lesson Image */}
                    <div className="relative w-24 h-16 bg-muted rounded-md shrink-0 overflow-hidden">
                      {lesson.image ? (
                        <OptimizedImage
                          src={lesson.image}
                          alt={lesson.title}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {lesson.contentType === 'video' ? (
                            <Video className="h-6 w-6 text-muted-foreground" />
                          ) : (
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Lesson Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-1">{lesson.title}</p>
                      {lesson.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {lesson.summary}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {lesson.contentType && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {lesson.contentType}
                          </Badge>
                        )}
                        {lesson.type === 'draft' && (
                          <Badge variant="outline" className="text-xs">
                            Draft
                          </Badge>
                        )}
                        {lesson.price !== undefined && lesson.price > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-primary/10 text-primary border border-primary/30"
                          >
                            {lesson.price.toLocaleString()} sats
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveLessonUp(index)}
                        disabled={index === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => moveLessonDown(index)}
                        disabled={index === lessons.length - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-6 bg-border mx-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLesson(index)}
                        className="h-8 w-8 p-0 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media & Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Media & Pricing</CardTitle>
          <CardDescription>
            Add a preview image and set your course pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image className="h-4 w-4 inline-block mr-1" role="img" aria-hidden="true" />
              Preview Image <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="image"
              type="url"
              placeholder="https://example.com/image.jpg"
              value={formData.image}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, image: e.target.value }))
                setErrors(prev => ({ ...prev, image: undefined }))
              }}
              className={errors.image ? 'border-destructive' : ''}
            />
            {errors.image && <p className="text-sm text-destructive">{errors.image}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">
              <DollarSign className="h-4 w-4 inline-block mr-1" />
              Course Price (in sats)
            </Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                min="0"
                placeholder="0"
                value={formData.price}
                disabled={!isPaidCourse}
                onChange={(e) => {
                  if (!isPaidCourse) return
                  setFormData(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))
                  setErrors(prev => ({ ...prev, price: undefined }))
                }}
                className={errors.price ? 'border-destructive' : ''}
              />
              {isPaidCourse && formData.price > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Badge variant="secondary" className="text-xs">
                    Premium
                  </Badge>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isPaidCourse
                ? 'Set the course price in sats.'
                : 'Free courses save at 0 sats. Switch to paid to set or edit a price.'}
            </p>
            {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization</CardTitle>
          <CardDescription>
            Add topics to help users discover your course
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>
              <Tag className="h-4 w-4 inline-block mr-1" />
              Topics
            </Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a topic (e.g., Bitcoin, Lightning, Nostr)"
                  value={currentTopic}
                  onChange={(e) => setCurrentTopic(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTopic()
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={addTopic}
                  size="icon"
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.topics.map((topic, index) => (
                    <Badge key={index} variant="secondary" className="pl-3 pr-1 py-1">
                      {topic}
                      <button
                        type="button"
                        onClick={() => removeTopic(index)}
                        className="ml-2 p-1 hover:bg-destructive/20 rounded-sm transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {errors.topics && <p className="text-sm text-destructive">{errors.topics}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex gap-4 pt-6 pb-8">
        <Button 
          type="submit" 
          disabled={isSubmitting}
          size="lg"
          className="min-w-[120px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            draftId ? 'Update Course Draft' : 'Create Course Draft'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.push('/drafts')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
