import { getServerSession } from "next-auth"
import { notFound } from 'next/navigation'

import { authOptions } from "@/lib/auth"
import { getResourcePageData } from "@/lib/resource-page-data.server"
import ResourceDetailsContent from './resource-details-page-client'

interface ResourceDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ResourceDetailsPage({ params }: ResourceDetailsPageProps) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const { event, initialMeta, shouldNotFound } = await getResourcePageData({
    resourceId: id,
    viewerUserId: session?.user?.id ?? null,
  })

  if (shouldNotFound) {
    notFound()
  }

  return (
    <ResourceDetailsContent
      resourceId={id}
      initialEvent={event}
      initialMeta={initialMeta}
    />
  )
}
