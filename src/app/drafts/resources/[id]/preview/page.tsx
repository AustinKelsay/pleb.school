'use client'

import { Suspense, useEffect, useState } from 'react'
import React from 'react'
import { notFound, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DraftBadge, DraftPreviewBadge } from '@/components/ui/draft-badge'
import { DraftBanner, DraftActions } from '@/components/ui/draft-banner'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { VideoPlayer } from '@/components/ui/video-player'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { encodePublicKey } from 'snstr'
import { 
  Clock, 
  Eye, 
  FileText, 
  Play, 
  ArrowLeft, 
  BookOpen, 
  Video, 
  Calendar,
  User,
  Edit,
  Share,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { DraftContentSkeleton } from '@/components/ui/app-skeleton-client'
import { normalizeAdditionalLinks } from '@/lib/additional-links'
import { AdditionalLinksCard } from '@/components/ui/additional-links-card'
import type { AdditionalLink } from '@/types/additional-links'

interface ResourceDraftPreviewPageProps {
  params: Promise<{
    id: string
  }>
}

interface DraftData {
  id: string
  type: string
  title: string
  summary: string
  content: string
  image?: string | null
  price?: number | null
  topics: string[]
  additionalLinks: AdditionalLink[]
  videoUrl?: string | null
  createdAt: string
  updatedAt: string
  userId: string
  user: {
    id: string
    username?: string | null
    avatar?: string | null
    pubkey?: string | null
  }
}

function formatNpubWithEllipsis(pubkey: string): string {
  try {
    const npub = encodePublicKey(pubkey as `${string}1${string}`);
    return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
  } catch {
    // Fallback to hex format if encoding fails
    return `${pubkey.slice(0, 6)}...${pubkey.slice(-6)}`;
  }
}

/**
 * Content metadata component
 */
function ContentMetadata({ draftData }: { draftData: DraftData }) {
  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getReadingTime = (content: string): number => {
    const wordsPerMinute = 200
    const words = content.trim().split(/\s+/).length
    return Math.ceil(words / wordsPerMinute)
  }

  const additionalContent = draftData.content?.trim()
  const readingTime = draftData.type !== 'video'
    ? getReadingTime(draftData.content)
    : additionalContent
      ? getReadingTime(additionalContent)
      : null

  return (
    <div className="space-y-4">
      {/* Basic metadata */}
      <div className="flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-muted-foreground">
        <div className="flex items-center space-x-1">
          <User className="h-4 w-4" />
          <span>
            {draftData.user?.username || 
             (draftData.user?.pubkey ? formatNpubWithEllipsis(draftData.user.pubkey) : 'Anonymous')}
          </span>
        </div>
        
        <div className="flex items-center space-x-1">
          <Calendar className="h-4 w-4" />
          <span>{formatDate(draftData.createdAt)}</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <Eye className="h-4 w-4" />
          <span>Draft Preview</span>
        </div>
        
        {readingTime && (
          <div className="flex items-center space-x-1">
            <Clock className="h-4 w-4" />
            <span>{readingTime} min read</span>
          </div>
        )}
        
        {draftData.type === 'video' && (
          <div className="flex items-center space-x-1">
            <Play className="h-4 w-4" />
            <span>15 min</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Resource content component that displays the draft content
 */
function ResourceDraftContent({ resourceId }: { resourceId: string }) {
  const [draftData, setDraftData] = useState<DraftData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDraft = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(`/api/drafts/resources/${resourceId}`)
        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch draft')
        }
        
        setDraftData({
          ...result.data,
          additionalLinks: normalizeAdditionalLinks(result.data.additionalLinks)
        })
      } catch (err) {
        console.error('Error fetching draft:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch draft')
      } finally {
        setLoading(false)
      }
    }

    if (resourceId) {
      fetchDraft()
    }
  }, [resourceId])

  if (loading) {
    return <DraftContentSkeleton />
  }

  if (error) {
    return (
      <Alert className="border-destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!draftData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Draft content not available</p>
      </div>
    )
  }

  const title = draftData.title
  const description = draftData.summary
  const category = draftData.topics[0] || 'general'
  const type = draftData.type || 'document'
  const additionalLinks = normalizeAdditionalLinks(draftData.additionalLinks)
  const additionalContent = draftData.content?.trim()
  const isPremium = (draftData.price ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Draft Preview Banner */}
      <DraftBanner
        title="Draft Content Preview"
        description="This is exactly how your content will appear when published."
        actions={
          <DraftActions
            editHref={`/create?draft=${resourceId}`}
            publishHref={`/drafts/resources/${resourceId}/publish`}
          />
        }
      />

      {/* Content Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">
              {category}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {type}
            </Badge>
            <DraftPreviewBadge />
            {isPremium && (
              <Badge variant="outline" className="border-warning text-warning">
                Premium
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
              <Link href={`/drafts/resources/${resourceId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Draft
              </Link>
            </Button>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{title}</h1>
        
        <ContentMetadata draftData={draftData} />
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        {type === 'video' ? (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <VideoPlayer 
                url={draftData.videoUrl || undefined}
                title={draftData.title}
                duration="15 min"
              />
              {additionalContent && (
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer content={draftData.content} />
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-lg max-w-none">
                <MarkdownRenderer content={draftData.content} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Additional Links */}
      <AdditionalLinksCard links={additionalLinks} icon="link" />

      {/* Draft Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Draft Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1" asChild>
              <Link href={`/create?draft=${resourceId}`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Content
              </Link>
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link href={`/drafts/resources/${resourceId}/publish`}>
                <Share className="h-4 w-4 mr-2" />
                Publish to Nostr
              </Link>
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link href={`/drafts/resources/${resourceId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Overview
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Resource draft preview page with full content display
 */
function ResourceDraftPreviewContent({ resourceId }: { resourceId: string }) {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          {/* Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" className="justify-start w-full sm:w-auto" asChild>
              <Link href={`/drafts/resources/${resourceId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Draft Overview
              </Link>
            </Button>
            <span className="text-muted-foreground hidden sm:inline">•</span>
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">
                Draft Content Preview
              </span>
            </div>
          </div>

          {/* Content */}
          <Suspense fallback={<DraftContentSkeleton />}>
            <ResourceDraftContent resourceId={resourceId} />
          </Suspense>
        </div>
      </Section>
    </MainLayout>
  )
}

export default function ResourceDraftPreviewPage({ params }: ResourceDraftPreviewPageProps) {
  const [resourceId, setResourceId] = useState<string>('')

  useEffect(() => {
    params.then(p => setResourceId(p.id))
  }, [params])

  if (!resourceId) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4"></div>
          </div>
        </Section>
      </MainLayout>
    )
  }

  return <ResourceDraftPreviewContent resourceId={resourceId} />
}
