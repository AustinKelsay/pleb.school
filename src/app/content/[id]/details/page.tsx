'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { ArrowLeft, FileText } from 'lucide-react'
import { ResourceContentView } from '@/app/content/components/resource-content-view'
import { ResourceContentViewSkeleton } from '@/app/content/components/resource-skeletons'

interface ResourceDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

function ResourceDetailsContent({ resourceId }: { resourceId: string }) {
  const router = useRouter()
  const handleMissingResource = useCallback(() => {
    router.replace('/404')
  }, [router])

  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" className="justify-start w-full sm:w-auto" asChild>
              <Link href={`/content/${resourceId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Overview
              </Link>
            </Button>
            <span className="text-muted-foreground hidden sm:inline">•</span>
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">Content Details</span>
            </div>
          </div>

          <Suspense fallback={<ResourceContentViewSkeleton />}>
            <ResourceContentView
              resourceId={resourceId}
              onMissingResource={handleMissingResource}
            />
          </Suspense>
        </div>
      </Section>
    </MainLayout>
  )
}

export default function ResourceDetailsPage({ params }: ResourceDetailsPageProps) {
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

  return <ResourceDetailsContent resourceId={resourceId} />
}
