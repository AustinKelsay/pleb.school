import { notFound } from 'next/navigation'
import { ResourceAdapter } from '@/lib/db-adapter'

import ResourcePageClient from './resource-page-client'

interface ResourcePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { id } = await params
  const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  if (isUuidId) {
    const resourceExists = await ResourceAdapter.exists(id)
    if (!resourceExists) {
      notFound()
    }
  }

  return <ResourcePageClient resourceId={id} />
}
