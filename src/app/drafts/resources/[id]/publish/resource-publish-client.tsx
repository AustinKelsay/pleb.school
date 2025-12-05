'use client'

import { useEffect, useState } from 'react'
import React from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { useResourceDraftQuery } from '@/hooks/useResourceDraftQuery'
import { usePublishResource } from '@/hooks/usePublishDraft'
import { useQueryClient } from '@tanstack/react-query'
import { 
  ArrowLeft,
  Share,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Eye,
  FileText,
  Video,
  BookOpen,
  Zap
} from 'lucide-react'
import type { AdditionalLink } from '@/types/additional-links'

interface ResourcePublishPageClientProps {
  resourceId: string
}

interface DraftData {
  id: string
  type: string
  title: string
  summary: string
  content: string
  image?: string
  price?: number
  topics: string[]
  additionalLinks?: AdditionalLink[]
  videoUrl?: string
  createdAt: string
  updatedAt: string
  userId: string
}

/**
 * Publish status component
 */
function PublishStatus({ 
  steps, 
  currentStep, 
  onRetry 
}: { 
  steps: Array<{
    id: string
    title: string
    description: string
    status: 'pending' | 'processing' | 'completed' | 'error'
    details?: string
    errorMessage?: string
  }>
  currentStep: number
  onRetry: () => void
}) {
  const getStepIcon = (step: typeof steps[0]) => {
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

  const getStepColor = (step: typeof steps[0]) => {
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
                    Successfully published to Nostr!
                  </span>
                </div>
                <div className="flex items-center space-x-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Preparing your published content page...
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
            {steps.map((step) => (
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
 * Resource summary component
 */
function ResourceSummary({ draftData }: { draftData: DraftData }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-5 w-5" />
      case 'guide':
        return <BookOpen className="h-5 w-5" />
      default:
        return <FileText className="h-5 w-5" />
    }
  }

  const isPremium = (draftData.price ?? 0) > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            {getTypeIcon(draftData.type)}
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
            <h4 className="font-medium text-sm">Type</h4>
            <p className="text-sm text-muted-foreground capitalize">{draftData.type}</p>
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
              {draftData.topics.map((topic, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-sm">Content Length</h4>
            <p className="text-sm text-muted-foreground">
              {Math.ceil(draftData.content.length / 1000)}k characters
            </p>
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
  resourceId, 
  isPublishing, 
  isComplete, 
  hasErrors,
  onStartPublish,
  publishedEventId
}: { 
  resourceId: string
  isPublishing: boolean
  isComplete: boolean
  hasErrors: boolean
  onStartPublish: () => void
  publishedEventId?: string
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
            disabled={hasErrors}
          >
            <Share className="h-4 w-4 mr-2" />
            Publish to Nostr
          </Button>
        )}

        {isComplete && publishedEventId && (
          <Button className="w-full" asChild>
            <Link href={`/content/${publishedEventId}`}>
              <Eye className="h-4 w-4 mr-2" />
              View Published Content
            </Link>
          </Button>
        )}

        <Button variant="outline" className="w-full" asChild>
          <Link href={`/drafts/resources/${resourceId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Draft
          </Link>
        </Button>

        <Button variant="outline" className="w-full" asChild>
          <Link href={`/drafts/resources/${resourceId}/preview`}>
            <Eye className="h-4 w-4 mr-2" />
            Preview Content
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Main publish page client component
 */
export function ResourcePublishPageClient({ resourceId }: ResourcePublishPageClientProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { publish, publishStatus, isSuccess, data: publishResult } = usePublishResource(resourceId)
  const enabled = !isSuccess
  const { data: draftData, isLoading, isError } = useResourceDraftQuery(resourceId, {
    enabled
  })
  const [draftSnapshot, setDraftSnapshot] = useState<DraftData | null>(null)

  useEffect(() => {
    if (draftData) {
      setDraftSnapshot(draftData)
    }
  }, [draftData])

  const handlePublish = () => {
    publish()
  }

  const handleRetry = () => {
    publishStatus.reset()
    publish()
  }

  // Redirect to the published content after successful publishing
  useEffect(() => {
    if (isSuccess && publishResult?.resource?.id) {
      // Invalidate resource queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['resources'] })
      queryClient.removeQueries({ queryKey: ['drafts', 'resources', resourceId] })

      const targetId = publishResult.resource.id
      router.prefetch(`/content/${targetId}`)

      const redirectTimer = setTimeout(() => {
        router.replace(`/content/${targetId}`)
      }, 300)

      return () => clearTimeout(redirectTimer)
    }
  }, [isSuccess, publishResult, router, queryClient, resourceId])

  const resolvedDraft: DraftData | null = draftData ?? draftSnapshot

  if (isLoading && !resolvedDraft) {
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

  if (isError && !resolvedDraft && !isSuccess) {
    notFound()
  }

  const isComplete = isSuccess
  const hasErrors = publishStatus.error !== null
  const publishedEventId = publishResult?.resource?.id

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
              <Link href={`/drafts/resources/${resourceId}`} className="hover:text-foreground">
                Resource Draft
              </Link>
              <span>•</span>
              <span>Publish</span>
            </div>

            <div>
              <h1 className="text-3xl font-bold">Publish to Nostr</h1>
              <p className="text-muted-foreground">
                Convert your draft to a published Nostr event that will be accessible to everyone
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
              {resolvedDraft && <ResourceSummary draftData={resolvedDraft} />}
              
              <PublishActions 
                resourceId={resourceId}
                isPublishing={publishStatus.isPublishing}
                isComplete={isComplete}
                hasErrors={hasErrors}
                onStartPublish={handlePublish}
                publishedEventId={publishedEventId}
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
                    Your content will be published as a NIP-23 long-form content event on the Nostr network.
                  </p>
                  <p>
                    Once published, your content will be permanently stored and accessible through Nostr relays worldwide.
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
