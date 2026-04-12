import { notFound } from 'next/navigation'
import { ResourceAdapter } from '@/lib/db-adapter'

import ResourceDetailsContent from './resource-details-page-client'

interface ResourceDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ResourceDetailsPage({ params }: ResourceDetailsPageProps) {
  const { id } = await params
  const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  if (isUuidId) {
    const resourceExists = await ResourceAdapter.exists(id)
    if (!resourceExists) {
      notFound()
    }
  }

  return <ResourceDetailsContent resourceId={id} />
}
