'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { hasNip07Support, type NostrEvent } from 'snstr'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useRepublishCourseMutation } from '@/hooks/usePublishedContentMutations'
import { createUnsignedCourseEvent, type CourseEventDraftInput } from '@/lib/nostr-events'

export type CourseEditData = {
  id: string
  title: string
  summary: string
  image?: string
  price: number
  topics: string[]
  lessonCount?: number
  pubkey?: string
  lessonReferences?: Array<{ resourceId: string; pubkey: string; price?: number }>
}

type EditPublishedCourseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  data?: CourseEditData
  onSuccess?: () => void
}

export function EditPublishedCourseDialog({
  open,
  onOpenChange,
  data,
  onSuccess,
}: EditPublishedCourseDialogProps) {
  const mutation = useRepublishCourseMutation()
  const [error, setError] = useState<string | null>(null)
  const [topicInput, setTopicInput] = useState('')
  const [formState, setFormState] = useState<CourseEditData | null>(data ?? null)

  useEffect(() => {
    if (data) {
      setFormState(data)
      setTopicInput('')
      setError(null)
    }
  }, [data, open])

  const displayTopics = useMemo(() => {
    if (!formState) return []
    return formState.topics.map(topic => topic.trim()).filter(Boolean)
  }, [formState])

  /**
   * Build normalized course payload from form state
   * Returns trimmed and validated course fields
   */
  function buildCoursePayload(
    formState: CourseEditData,
    displayTopics: string[]
  ): {
    title: string
    summary: string
    image?: string
    price: number
    topics: string[]
  } {
    return {
      title: formState.title.trim(),
      summary: formState.summary.trim(),
      image: formState.image?.trim() || undefined,
      price:
        Number.isFinite(formState.price) && formState.price >= 0 ? formState.price : 0,
      topics: displayTopics,
    }
  }

  const attemptNip07Republish = async (): Promise<boolean> => {
    if (!formState) {
      return false
    }

    if (!hasNip07Support()) {
      setError('Nostr extension not available for signing.')
      return false
    }

    if (!formState.lessonReferences || formState.lessonReferences.length === 0) {
      setError('Course must reference at least one published lesson before republishing.')
      return false
    }

    try {
      const pubkey = await (window as any).nostr.getPublicKey()
      if (!pubkey) {
        setError('Unable to retrieve pubkey from Nostr extension.')
        return false
      }

      if (formState.pubkey && formState.pubkey !== pubkey) {
        setError('Active Nostr key does not match the original course publisher.')
        return false
      }

      const draftLike: CourseEventDraftInput = {
        ...buildCoursePayload(formState, displayTopics),
        id: formState.id,
        userId: '',
      }

      const unsignedEvent = createUnsignedCourseEvent(
        draftLike,
        formState.lessonReferences,
        pubkey
      )
      const signedEvent: NostrEvent = await (window as any).nostr.signEvent(unsignedEvent)

      await mutation.mutateAsync({
        id: formState.id,
        data: {
          ...buildCoursePayload(formState, displayTopics),
          signedEvent,
        },
      })

      onSuccess?.()
      onOpenChange(false)
      return true
    } catch (signError) {
      const message =
        signError instanceof Error ? signError.message : 'Failed to sign event with Nostr'
      setError(message)
      return false
    }
  }

  const handleAddTopic = () => {
    if (!formState) return
    const value = topicInput.trim()
    if (!value) return

    setFormState(prev =>
      prev
        ? {
            ...prev,
            topics: Array.from(new Set([...prev.topics, value])),
          }
        : prev
    )
    setTopicInput('')
  }

  const handleRemoveTopic = (topic: string) => {
    setFormState(prev =>
      prev
        ? {
            ...prev,
            topics: prev.topics.filter(item => item !== topic),
          }
        : prev
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formState) return

    if (!formState.title.trim()) {
      setError('Title is required')
      return
    }

    if (!formState.summary.trim()) {
      setError('Summary is required')
      return
    }

    setError(null)

    let attemptedNip07 = false

    if (hasNip07Support() && (formState.lessonReferences?.length ?? 0) > 0) {
      attemptedNip07 = true
      const succeeded = await attemptNip07Republish()
      if (succeeded) {
        return
      }
    }

    try {
      await mutation.mutateAsync({
        id: formState.id,
        data: {
          ...buildCoursePayload(formState, displayTopics),
        },
      })

      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code
        if (code === 'PRIVKEY_REQUIRED' && !attemptedNip07) {
          // Only retry if prerequisites for Nip07 republish are actually present
          const hasNip07 = hasNip07Support()
          const hasLessonReferences =
            formState.lessonReferences && formState.lessonReferences.length > 0

          if (hasNip07 && hasLessonReferences) {
            setError(null)
            const succeeded = await attemptNip07Republish()
            if (succeeded) {
              return
            }
            setError(
              `${err.message}. Provide a freshly signed Nostr event or the owner's private key to continue.`
            )
          } else {
            // Prerequisites not met - explain what's missing
            const missingRequirements: string[] = []
            if (!hasNip07) {
              missingRequirements.push('Nostr extension')
            }
            if (!hasLessonReferences) {
              missingRequirements.push('at least one published lesson reference')
            }
            setError(
              `${err.message}. Cannot use Nip07 signing because ${missingRequirements.join(' and ')} ${missingRequirements.length === 1 ? 'is' : 'are'} missing. Provide a freshly signed Nostr event or the owner's private key to continue.`
            )
          }
        } else {
          setError(err.message)
        }
      } else {
        setError('Failed to update course')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Published Course</DialogTitle>
          <DialogDescription>
            Adjust course metadata and republish this replaceable event so subscribers see the
            latest information.
          </DialogDescription>
        </DialogHeader>

        {!formState ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="course-title">Title</Label>
                <Input
                  id="course-title"
                  value={formState.title}
                  onChange={event =>
                    setFormState(prev => (prev ? { ...prev, title: event.target.value } : prev))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="course-summary">Summary</Label>
                <Textarea
                  id="course-summary"
                  rows={4}
                  value={formState.summary}
                  onChange={event =>
                    setFormState(prev => (prev ? { ...prev, summary: event.target.value } : prev))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="course-price">Price (sats)</Label>
                  <Input
                    id="course-price"
                    type="number"
                    min={0}
                    value={
                      Number.isFinite(formState.price) && formState.price >= 0
                        ? formState.price
                        : 0
                    }
                    onChange={event => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      const nextPrice = Number.isNaN(parsed) ? 0 : Math.max(0, parsed)
                      setFormState(prev =>
                        prev ? { ...prev, price: nextPrice } : prev
                      )
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="course-image">Image URL</Label>
                  <Input
                    id="course-image"
                    value={formState.image ?? ''}
                    onChange={event =>
                      setFormState(prev =>
                        prev ? { ...prev, image: event.target.value } : prev
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Topics</Label>
                <div className="flex gap-2">
                  <Input
                    value={topicInput}
                    onChange={event => setTopicInput(event.target.value)}
                    placeholder="Add new topic"
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleAddTopic()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTopic}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
                {displayTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {displayTopics.map(topic => (
                      <Badge key={topic} variant="secondary" className="flex items-center gap-1">
                        #{topic}
                        <button
                          type="button"
                          onClick={() => handleRemoveTopic(topic)}
                          className="ml-1 focus:outline-none"
                          aria-label={`Remove ${topic}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No topics added yet.</p>
                )}
              </div>

              <div className="rounded-md border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  Lessons linked to this course remain unchanged. Republishing keeps the same{' '}
                  <code>d</code> tag so learners receive the newest metadata without breaking
                  lesson references.
                </p>
                {typeof formState.lessonCount === 'number' && formState.lessonCount >= 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Connected lessons: {formState.lessonCount}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-0">
              <p className="text-xs text-muted-foreground">
                This publishes a new signature to the same replaceable event, ensuring clients fetch
                the updated course definition.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
