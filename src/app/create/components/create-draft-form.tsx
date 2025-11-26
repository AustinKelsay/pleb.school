'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { 
  X, 
  AlertCircle, 
  CheckCircle, 
  FileText, 
  Video, 
  BookOpen, 
  FileCode, 
  Map, 
  ScrollText,
  Image,
  DollarSign,
  Tag,
  Link2,
  Plus,
  Eye,
  Edit
} from 'lucide-react'

type ContentType = 'document' | 'video'

interface FormData {
  type: ContentType
  title: string
  summary: string
  content: string
  image: string
  price: number
  topics: string[]
  additionalLinks: string[]
  videoUrl?: string // For video type
}

export default function CreateDraftForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const draftId = searchParams.get('draft')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPaidResource, setIsPaidResource] = useState(false)
  const lastPaidPriceRef = useRef<number>(100)
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    type: 'document',
    title: '',
    summary: '',
    content: '',
    image: '',
    price: 0,
    topics: [],
    additionalLinks: [],
    videoUrl: '',
  })
  
  // Preview state for markdown
  const [showPreview, setShowPreview] = useState(false)
  
  // Temporary input states
  const [currentTopic, setCurrentTopic] = useState('')
  const [currentLink, setCurrentLink] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'videoUrl', string>>>({})

  // Load draft data if editing
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) return
      
      setIsLoading(true)
      try {
        const response = await fetch(`/api/drafts/resources/${draftId}`)
        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to load draft')
        }
        
        const draft = result.data
        setFormData({
          type: draft.type as ContentType,
          title: draft.title,
          summary: draft.summary,
          content: draft.type === 'video' ? (draft.content || '') : draft.content,
          image: draft.image || '',
          price: draft.price || 0,
          topics: draft.topics || [],
          additionalLinks: draft.additionalLinks || [],
          videoUrl: draft.videoUrl || ''
        })
        setIsPaidResource((draft.price ?? 0) > 0)
        if (typeof draft.price === 'number' && draft.price > 0) {
          lastPaidPriceRef.current = draft.price
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
  }, [draftId])

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
    
    if (formData.type === 'video') {
      if (!formData.videoUrl?.trim()) {
        newErrors.videoUrl = 'Video URL is required for video content'
      } else if (!isValidUrl(formData.videoUrl)) {
        newErrors.videoUrl = 'Must be a valid URL'
      }
    } else {
      if (!formData.content.trim()) {
        newErrors.content = 'Content is required'
      }
    }
    
    if (formData.image && !isValidUrl(formData.image)) {
      newErrors.image = 'Must be a valid URL'
    }
    
    if (formData.price < 0) {
      newErrors.price = 'Price must be 0 or greater'
    }
    if (isPaidResource && formData.price <= 0) {
      newErrors.price = 'Paid resources must have a price above 0 sats'
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

  const addLink = () => {
    if (currentLink.trim()) {
      if (isValidUrl(currentLink.trim())) {
        setFormData(prev => ({
          ...prev,
          additionalLinks: [...prev.additionalLinks, currentLink.trim()]
        }))
        setCurrentLink('')
      } else {
        setMessage({ type: 'error', text: 'Please enter a valid URL' })
        setTimeout(() => setMessage(null), 3000)
      }
    }
  }

  const removeLink = (index: number) => {
    setFormData(prev => ({
      ...prev,
      additionalLinks: prev.additionalLinks.filter((_, i) => i !== index)
    }))
  }

  const handleResourcePaidToggle = (checked: boolean) => {
    setIsPaidResource(checked)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    setMessage(null)
    
    try {
      const url = draftId ? `/api/drafts/resources/${draftId}` : '/api/drafts/resources'
      const method = draftId ? 'PUT' : 'POST'
      
      const payload = {
        ...formData,
        price: isPaidResource ? formData.price : 0,
        content: formData.content,
      }

      if (formData.type === 'video') {
        const trimmedVideoUrl = formData.videoUrl?.trim()

        if (trimmedVideoUrl) {
          (payload as typeof payload & { videoUrl?: string }).videoUrl = trimmedVideoUrl
        } else {
          delete (payload as { videoUrl?: string }).videoUrl
        }
      } else {
        delete (payload as { videoUrl?: string }).videoUrl
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create draft')
      }

      const result = await response.json()
      
      setMessage({ 
        type: 'success', 
        text: draftId ? 'Draft updated successfully! Redirecting...' : 'Draft created successfully! Redirecting...' 
      })

      queryClient.invalidateQueries({ queryKey: ['drafts'] })
      
      setTimeout(() => {
        router.push(`/drafts/resources/${result.data.id}`)
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

  const contentTypeIcons = {
    document: FileText,
    video: Video,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

      {/* Content Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Content Type</CardTitle>
          <CardDescription>
            Choose the type of content you&apos;re creating
          </CardDescription>
        </CardHeader>
        <CardContent>

          <Select 
            value={formData.type} 
            onValueChange={(value: ContentType) => setFormData(prev => ({ ...prev, type: value }))}
          >
            <SelectTrigger id="type">
              <SelectValue placeholder="Select content type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(contentTypeIcons).map(([type, Icon]) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center">
                    <Icon className="h-4 w-4 mr-2" />
                    <span className="capitalize">{type}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
          <CardDescription>
            Provide the essential details about your content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter a descriptive title"
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
              placeholder="Provide a brief summary of your content"
              className={`resize-none ${errors.summary ? 'border-destructive' : ''}`}
              rows={3}
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

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Content</CardTitle>
          <CardDescription>
            {formData.type === 'video' 
              ? 'Provide the video URL and any additional written content'
              : 'Write your main content using Markdown for formatting'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formData.type === 'video' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="videoUrl">
                  <Video className="h-4 w-4 inline-block mr-1" />
                  Video URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="videoUrl"
                  type="url"
                  placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                  value={formData.videoUrl}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, videoUrl: e.target.value }))
                    setErrors(prev => ({ ...prev, videoUrl: undefined }))
                  }}
                  className={errors.videoUrl ? 'border-destructive' : ''}
                />
                <p className="text-sm text-muted-foreground">
                  Supported: YouTube, Vimeo, and direct video file URLs
                </p>
                {errors.videoUrl && <p className="text-sm text-destructive">{errors.videoUrl}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="content">
                  Additional Content <span className="text-muted-foreground">(Optional)</span>
                </Label>
                <Textarea
                  id="content"
                  placeholder="Add transcript, notes, or supplementary content..."
                  className="resize-none font-mono text-sm"
                  rows={10}
                  value={formData.content}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, content: e.target.value }))
                  }}
                />
              </div>
            </div>
          ) : (
            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit" className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="edit" className="space-y-2">
                <Textarea
                  id="content"
                  placeholder="Enter your content here...\n\nYou can use:\n- **Bold** and *italic* text\n- # Headers\n- [Links](https://example.com)\n- \`code blocks\`\n- Lists and more!"
                  className={`resize-none font-mono text-sm ${errors.content ? 'border-destructive' : ''}`}
                  rows={20}
                  value={formData.content}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, content: e.target.value }))
                    setErrors(prev => ({ ...prev, content: undefined }))
                  }}
                />
                {errors.content && <p className="text-sm text-destructive">{errors.content}</p>}
              </TabsContent>
              
              <TabsContent value="preview" className="min-h-[500px]">
                <Card className="bg-background">
                  <CardContent className="pt-6">
                    {formData.content ? (
                      <MarkdownRenderer content={formData.content} />
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        Start writing to see the preview
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Media & Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Media & Pricing</CardTitle>
          <CardDescription>
            Add a preview image and set your content pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
            <div>
              <p className="text-sm font-medium">Pricing mode</p>
              <p className="text-xs text-muted-foreground">
                Free resources save at 0 sats. Switch to paid to set a price.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Free</span>
              <Switch checked={isPaidResource} onCheckedChange={handleResourcePaidToggle} />
              <span className="text-xs font-semibold text-primary">Paid</span>
            </div>
          </div>

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
              Price (in sats)
            </Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                min="0"
                placeholder="0"
                value={formData.price}
                disabled={!isPaidResource}
                onChange={(e) => {
                  if (!isPaidResource) return
                  const parsed = parseInt(e.target.value) || 0
                  setFormData(prev => ({ ...prev, price: parsed }))
                  if (parsed > 0) {
                    lastPaidPriceRef.current = parsed
                  }
                  setErrors(prev => ({ ...prev, price: undefined }))
                }}
                className={errors.price ? 'border-destructive' : ''}
              />
              {isPaidResource && formData.price > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Badge variant="secondary" className="text-xs">
                    Premium
                  </Badge>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isPaidResource ? 'Set the price in sats.' : 'Free resources always save at 0 sats.'}
            </p>
            {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Topics & Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization</CardTitle>
          <CardDescription>
            Add topics and external resources to help users discover your content
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

          <div className="space-y-2">
            <Label>
              <Link2 className="h-4 w-4 inline-block mr-1" />
              Additional Links <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://example.com/resource"
                  value={currentLink}
                  onChange={(e) => setCurrentLink(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addLink()
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={addLink}
                  size="icon"
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.additionalLinks.length > 0 && (
                <div className="space-y-2 rounded-lg border p-3">
                  {formData.additionalLinks.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 group">
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate flex-1">
                        {link}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLink(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-transparent" />
              Creating...
            </>
          ) : (
            draftId ? 'Update Draft' : 'Create Draft'
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
