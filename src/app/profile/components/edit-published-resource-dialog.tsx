'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
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
import { Loader2, Plus, X } from 'lucide-react'
import { useRepublishResourceMutation } from '@/hooks/usePublishedContentMutations'
import { createUnsignedResourceEvent, type ResourceEventDraftInput } from '@/lib/nostr-events'
import { hasNip07Support, type NostrEvent } from 'snstr'
import { normalizeAdditionalLinks, additionalLinkLabel } from '@/lib/additional-links'
import type { AdditionalLink } from '@/types/additional-links'

export type ResourceEditData = {
  id: string
  title: string
  summary: string
  content: string
  originalContent?: string
  hasEncryptedContent?: boolean
  price: number
  image?: string
  topics: string[]
  additionalLinks: AdditionalLink[]
  type: 'document' | 'video'
  videoUrl?: string
  pubkey?: string
}

type EditPublishedResourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  data?: ResourceEditData
  onSuccess?: () => void
}

export function EditPublishedResourceDialog({
  open,
  onOpenChange,
  data,
  onSuccess,
}: EditPublishedResourceDialogProps) {
  const mutation = useRepublishResourceMutation()
  const [error, setError] = useState<string | null>(null)
  const [topicInput, setTopicInput] = useState('')
  const [linkTitleInput, setLinkTitleInput] = useState('')
  const [linkUrlInput, setLinkUrlInput] = useState('')
  const [preserveEncryptedContent, setPreserveEncryptedContent] = useState(false)

  const [formState, setFormState] = useState<ResourceEditData | null>(data ?? null)

  useEffect(() => {
    if (data) {
      setFormState({
        ...data,
        additionalLinks: normalizeAdditionalLinks(data.additionalLinks),
      })
      setTopicInput('')
      setLinkTitleInput('')
      setLinkUrlInput('')
      setPreserveEncryptedContent(Boolean(data.hasEncryptedContent))
      setError(null)
    }
  }, [data, open])

  const isVideo = formState?.type === 'video'

  const displayTopics = useMemo(() => {
    if (!formState) return []
    return formState.topics.map(topic => topic.trim()).filter(Boolean)
  }, [formState])

  const displayLinks = useMemo(() => {
    if (!formState) return []
    return normalizeAdditionalLinks(formState.additionalLinks)
  }, [formState])

  const requestNip07Signature = async (
    resource: ResourceEditData,
    payload: {
      title: string
      summary: string
      content: string
      price: number
      image?: string
      topics: string[]
      additionalLinks: AdditionalLink[]
      type: 'document' | 'video'
      videoUrl?: string
    }
  ): Promise<{ event: NostrEvent | null; error?: string }> => {
    if (!hasNip07Support()) {
      return { event: null, error: 'Nostr extension not available for signing.' }
    }

    const nostr = (window as any).nostr
    if (!nostr?.getPublicKey || !nostr?.signEvent) {
      return { event: null, error: 'Nostr extension not available for signing.' }
    }

    try {
      const pubkey = await nostr.getPublicKey()
      if (!pubkey) {
        return { event: null, error: 'Unable to retrieve pubkey from Nostr extension.' }
      }

      if (resource.pubkey && resource.pubkey !== pubkey) {
        return { event: null, error: 'Active Nostr key does not match the original publisher.' }
      }

      const draftLike: ResourceEventDraftInput = {
        id: resource.id,
        userId: '',
        type: payload.type,
        title: payload.title,
        summary: payload.summary,
        content: payload.content,
        image: payload.image ?? null,
        price: payload.price,
        topics: payload.topics,
        additionalLinks: payload.additionalLinks,
        videoUrl: payload.type === 'video' ? payload.videoUrl ?? null : null,
      }

      const unsignedEvent = createUnsignedResourceEvent(draftLike, pubkey)
      const signedEvent: NostrEvent = await nostr.signEvent(unsignedEvent)
      return { event: signedEvent }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign event with Nostr'
      return { event: null, error: message }
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

  const handleAddLink = () => {
    if (!formState) return
    const url = linkUrlInput.trim()
    const title = linkTitleInput.trim()
    if (!url) return

    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`

    try {
      new URL(normalizedUrl)
    } catch {
      setError('Please enter a valid URL for additional links.')
      return
    }

    setFormState(prev =>
      prev
        ? {
            ...prev,
            additionalLinks: normalizeAdditionalLinks([
              ...prev.additionalLinks,
              { url: normalizedUrl, title },
            ]),
          }
        : prev
    )
    setLinkTitleInput('')
    setLinkUrlInput('')
  }

  const handleRemoveLink = (linkUrl: string) => {
    setFormState(prev =>
      prev
        ? {
            ...prev,
            additionalLinks: prev.additionalLinks.filter(item => item.url !== linkUrl),
          }
        : prev
    )
  }

  /**
   * Builds the payload object from form state with proper normalization.
   * Trims title and summary, normalizes price, and conditionally includes videoUrl.
   */
  const buildPayload = () => {
    if (!formState) {
      throw new Error("Form state is required to build payload")
    }

    return {
      title: formState.title.trim(),
      summary: formState.summary.trim(),
      content:
        preserveEncryptedContent && formState.hasEncryptedContent
          ? formState.originalContent ?? formState.content
          : formState.content,
      price:
        Number.isFinite(formState.price) && formState.price >= 0
          ? formState.price
          : 0,
      image: formState.image?.trim() || undefined,
      topics: displayTopics,
      additionalLinks: displayLinks,
      type: formState.type,
      videoUrl: isVideo ? formState.videoUrl?.trim() || undefined : undefined,
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    if (isVideo && !formState.videoUrl?.trim()) {
      setError('Video URL is required for video content')
      return
    }

    setError(null)

    try {
      const payload = buildPayload()

      const { event: preSignedEvent } = await requestNip07Signature(formState, payload)
      const requestData = preSignedEvent ? { ...payload, signedEvent: preSignedEvent } : payload

      await mutation.mutateAsync({
        id: formState.id,
        data: requestData,
      })

      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code
        if (code === 'PRIVKEY_REQUIRED') {
          const payload = buildPayload()

          const { event, error: signingError } = await requestNip07Signature(formState, payload)

          if (event) {
            try {
              await mutation.mutateAsync({
                id: formState.id,
                data: { ...payload, signedEvent: event },
              })
              onSuccess?.()
              onOpenChange(false)
              return
            } catch (retryError) {
              const retryMessage =
                retryError instanceof Error
                  ? retryError.message
                  : 'Failed to update resource'
              setError(retryMessage)
              return
            }
          }

          const fallbackMessage = `${err.message}. Provide a freshly signed Nostr event or the owner's private key to continue.`
          setError(
            signingError ? `${signingError} Provide a freshly signed Nostr event or the owner's private key to continue.` : fallbackMessage
          )
        } else {
          setError(err.message)
        }
      } else {
        setError('Failed to update resource')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Published Resource</DialogTitle>
          <DialogDescription>
            Update the metadata and content, then we will republish this replaceable event on
            Nostr with the same identifier.
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
                <Label htmlFor="resource-title">Title</Label>
                <Input
                  id="resource-title"
                  value={formState.title}
                  onChange={event =>
                    setFormState(prev => (prev ? { ...prev, title: event.target.value } : prev))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resource-summary">Summary</Label>
                <Textarea
                  id="resource-summary"
                  rows={3}
                  value={formState.summary}
                  onChange={event =>
                    setFormState(prev => (prev ? { ...prev, summary: event.target.value } : prev))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resource-price">Price (sats)</Label>
                  <Input
                    id="resource-price"
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
                  <Label htmlFor="resource-image">Image URL</Label>
                  <Input
                    id="resource-image"
                    value={formState.image ?? ''}
                    onChange={event =>
                      setFormState(prev =>
                        prev ? { ...prev, image: event.target.value } : prev
                      )
                    }
                  />
                </div>
              </div>

              {isVideo && (
                <div className="space-y-2">
                  <Label htmlFor="resource-video">Video URL</Label>
                  <Input
                    id="resource-video"
                    value={formState.videoUrl ?? ''}
                    onChange={event =>
                      setFormState(prev =>
                        prev ? { ...prev, videoUrl: event.target.value } : prev
                      )
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>
                  {isVideo ? 'Supporting Markdown' : 'Content'}
                  {isVideo && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (body content shown below the embedded video)
                    </span>
                  )}
                </Label>
                {formState.hasEncryptedContent && preserveEncryptedContent && (
                  <Alert>
                    <AlertDescription className="space-y-3">
                      <p>
                        This resource body appears encrypted from a previous publish. It will be preserved as-is
                        so you can safely update price and metadata.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPreserveEncryptedContent(false)}
                      >
                        Replace Body Manually
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <Textarea
                  rows={8}
                  value={formState.content}
                  disabled={Boolean(formState.hasEncryptedContent && preserveEncryptedContent)}
                  placeholder={
                    formState.hasEncryptedContent && preserveEncryptedContent
                      ? 'Encrypted content is being preserved.'
                      : undefined
                  }
                  onChange={event =>
                    setFormState(prev =>
                      prev ? { ...prev, content: event.target.value } : prev
                    )
                  }
                />
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

              <div className="space-y-2">
                <Label>Additional Links</Label>
                <div className="flex flex-col gap-2">
                  <Input
                    value={linkTitleInput}
                    onChange={event => setLinkTitleInput(event.target.value)}
                    placeholder="Link title (e.g., Official docs)"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={linkUrlInput}
                      onChange={event => setLinkUrlInput(event.target.value)}
                      placeholder="https://example.com"
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleAddLink()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={handleAddLink}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
                {displayLinks.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {displayLinks.map(link => (
                      <div
                        key={link.url}
                        className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {link.title?.trim() || additionalLinkLabel(link)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLink(link.url)}
                          className="ml-1 focus:outline-none text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${link.url}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No extra links provided.</p>
                )}
              </div>
            </div>

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-0">
              <p className="text-xs text-muted-foreground">
                We will republish this replaceable event with an updated signature while keeping the
                same <code>d</code> tag so clients receive the latest version.
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
