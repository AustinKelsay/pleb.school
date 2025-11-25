'use client'

import { Suspense, useEffect, useState } from 'react'
import React from 'react'
import { notFound, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DraftBadge, DraftPreviewBadge } from '@/components/ui/draft-badge'
import { DraftBanner, DraftActions } from '@/components/ui/draft-banner'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { preserveLineBreaks } from '@/lib/text-utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { encodePublicKey } from 'snstr'
import { 
  Clock, 
  FileText, 
  Play, 
  ExternalLink,
  Eye,
  BookOpen,
  Video,
  Tag,
  Edit,
  Share,
  Trash2,
  AlertCircle
} from 'lucide-react'
import { formatLinkLabel } from '@/lib/link-label'

interface ResourceDraftPageProps {
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
  additionalLinks: string[]
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
 * Draft resource overview component
 */
function DraftResourceOverview({ resourceId }: { resourceId: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5" />
            <span>About this Resource (Draft)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground mb-2">
              Ready to preview the content?
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Click below to see how your content will appear when published.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button size="lg" asChild>
                <Link href={`/drafts/resources/${resourceId}/preview`}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Content
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href={`/create?draft=${resourceId}`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Draft
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Draft resource actions component
 */
function DraftResourceActions({ 
  resourceId, 
  onDelete, 
  isDeleting 
}: { 
  resourceId: string
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Button size="lg" className="bg-primary hover:bg-primary/90" asChild>
        <Link href={`/create?draft=${resourceId}`}>
          <Edit className="h-5 w-5 mr-2" />
          Edit Draft
        </Link>
      </Button>
      
      <Button size="lg" variant="outline" asChild>
        <Link href={`/drafts/resources/${resourceId}/preview`}>
          <Eye className="h-5 w-5 mr-2" />
          Preview Content
        </Link>
      </Button>
      
      <Button size="lg" variant="outline" asChild>
        <Link href={`/drafts/resources/${resourceId}/publish`}>
          <Share className="h-5 w-5 mr-2" />
          Publish to Nostr
        </Link>
      </Button>
      
      <Button 
        size="lg" 
        variant="outline" 
        className="text-destructive border-destructive/50 hover:bg-destructive/10"
        onClick={onDelete}
        disabled={isDeleting}
      >
        <Trash2 className="h-5 w-5 mr-2" />
        {isDeleting ? 'Deleting...' : 'Delete Draft'}
      </Button>
    </div>
  )
}

/**
 * Main resource draft page component
 */
function ResourceDraftPageContent({ resourceId }: { resourceId: string }) {
  const router = useRouter()
  const [draftData, setDraftData] = useState<DraftData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
        
        setDraftData(result.data)
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

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/drafts/resources/${resourceId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete draft')
      }

      // Redirect to drafts list after successful deletion
      router.push('/drafts')
    } catch (err) {
      console.error('Error deleting draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <div className="space-y-8">
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
          </div>
        </Section>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <Section spacing="lg">
          <Alert className="border-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </Section>
      </MainLayout>
    )
  }

  if (!draftData) {
    notFound()
  }

  const title = draftData.title
  const description = draftData.summary
  const topics = draftData.topics || []
  const additionalLinks = draftData.additionalLinks || []
  const image = draftData.image || null
  const type = draftData.type || 'document'
  const duration = type === 'video' ? '15 min' : undefined
  const author = draftData.user?.username || 
                 (draftData.user?.pubkey ? formatNpubWithEllipsis(draftData.user.pubkey) : 'Anonymous')

  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getResourceTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-5 w-5" />
      case 'guide':
        return <BookOpen className="h-5 w-5" />
      case 'cheatsheet':
        return <FileText className="h-5 w-5" />
      case 'reference':
        return <FileText className="h-5 w-5" />
      case 'tutorial':
        return <Play className="h-5 w-5" />
      case 'documentation':
        return <FileText className="h-5 w-5" />
      default:
        return <FileText className="h-5 w-5" />
    }
  }

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-8">
          {/* Draft Warning Banner */}
          <DraftBanner
            title="Draft Preview"
            description="This is how your resource will appear once published. Make changes or publish when ready."
            actions={
              <DraftActions
                editHref={`/create?draft=${resourceId}`}
                previewHref={`/drafts/resources/${resourceId}/preview`}
                publishHref={`/drafts/resources/${resourceId}/publish`}
                className="hidden xl:flex"
              />
            }
          />
          

          {/* Resource Header */}
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 xl:items-start">
            <div className="space-y-6 order-2 xl:order-1">
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {topics[0] || 'general'}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {type}
                  </Badge>
                  <DraftBadge variant="outline" />
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">{title}</h1>
                <p className="text-lg text-muted-foreground" style={preserveLineBreaks(description).style}>
                  {preserveLineBreaks(description).content}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-4 sm:gap-6">
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                  <span>Draft Preview</span>
                </div>
                
                {duration && (
                  <div className="flex items-center space-x-1.5 sm:space-x-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span>{duration}</span>
                  </div>
                )}
              </div>

              {/* Desktop Draft Actions */}
              <div className="hidden xl:block">
                <DraftResourceActions 
                  resourceId={resourceId} 
                  onDelete={handleDelete}
                  isDeleting={isDeleting}
                />
              </div>

              {/* Tags */}
              {topics && topics.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center">
                    <Tag className="h-4 w-4 mr-2" />
                    Topics
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Links */}
              {additionalLinks && additionalLinks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Additional Resources</h4>
                  <div className="space-y-2">
                    {additionalLinks.map((link: string, index: number) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      asChild
                    >
                      <a href={link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {formatLinkLabel(link)}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
              )}
            </div>

            <div className="relative order-1 xl:order-2">
              <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10">
                {/* Background pattern for visual interest */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div 
                    className="absolute inset-0" 
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
                      backgroundSize: '20px 20px'
                    } as React.CSSProperties}
                  />
                </div>
                
                {image && image !== '/placeholder.svg' ? (
                  <OptimizedImage 
                    src={image} 
                    alt={title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
                        {getResourceTypeIcon(type)}
                      </div>
                      <p className="text-lg font-medium text-foreground">
                        {type === 'video' ? 'Video Preview' : 'Resource Preview'}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">{type} • {topics[0] || 'general'}</p>
                    </div>
                  </div>
                )}

                {/* Draft overlay indicator */}
                <div className="absolute top-4 right-4">
                  <DraftPreviewBadge className="bg-background/95 backdrop-blur-sm text-foreground border-border shadow-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile/Tablet Draft Actions */}
          <div className="xl:hidden">
            <DraftResourceActions 
              resourceId={resourceId} 
              onDelete={handleDelete}
              isDeleting={isDeleting}
            />
          </div>

          {/* Resource Overview */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Suspense fallback={<div>Loading...</div>}>
                <DraftResourceOverview resourceId={resourceId} />
              </Suspense>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>About this {type}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Author</h4>
                    <p className="text-sm text-muted-foreground">{author}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Status</h4>
                    <p className="text-sm text-muted-foreground">Draft - Not Published</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Type</h4>
                    <p className="text-sm text-muted-foreground capitalize">{type}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Category</h4>
                    <p className="text-sm text-muted-foreground capitalize">{topics[0] || 'general'}</p>
                  </div>
                  {duration && (
                    <div>
                      <h4 className="font-semibold mb-2">Duration</h4>
                      <p className="text-sm text-muted-foreground">{duration}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold mb-2">Price</h4>
                    <p className="text-sm text-muted-foreground">
                      {(draftData.price ?? 0) > 0 ? `${(draftData.price ?? 0).toLocaleString()} sats` : 'Free'}
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
                    <Link href={`/create?draft=${resourceId}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Content
                    </Link>
                  </Button>
                  
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/drafts/resources/${resourceId}/preview`}>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview Content
                    </Link>
                  </Button>
                  
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/drafts/resources/${resourceId}/publish`}>
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

/**
 * Resource draft page with dynamic routing
 */
export default function ResourceDraftPage({ params }: ResourceDraftPageProps) {
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

  return <ResourceDraftPageContent resourceId={resourceId} />
}
