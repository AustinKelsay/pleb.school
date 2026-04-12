import { getServerSession } from "next-auth"

import ContentPageClient from "@/app/content/content-page-client"
import { authOptions } from "@/lib/auth"
import { getContentConfig } from "@/lib/content-config"
import { getContentCatalogData, contentCatalogCopy } from "@/lib/content-catalog.server"

export default async function ContentPage() {
  const session = await getServerSession(authOptions)
  const contentConfig = getContentConfig()
  const includeLessonResources = contentConfig.contentPage.includeLessonResources
  const includeLessonVideos = includeLessonResources?.videos ?? true
  const includeLessonDocuments = includeLessonResources?.documents ?? true
  const { items, availableTags } = await getContentCatalogData({
    viewerUserId: session?.user?.id ?? null,
    includeLessonVideos,
    includeLessonDocuments,
  })

  return (
    <ContentPageClient
      initialItems={items}
      initialAvailableTags={availableTags}
      contentLibrary={contentCatalogCopy.contentLibrary}
      pricing={contentCatalogCopy.pricing}
    />
  )
}
