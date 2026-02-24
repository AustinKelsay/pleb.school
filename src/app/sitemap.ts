import type { MetadataRoute } from "next"
import { CourseAdapter, ResourceAdapter } from "@/lib/db-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

let hasLoggedCourseSitemapError = false
let hasLoggedResourceSitemapError = false

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXTAUTH_URL || "https://pleb.school").replace(/\/+$/, "")

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/content`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/feeds`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ]

  // Dynamic course pages
  let coursePages: MetadataRoute.Sitemap = []
  try {
    const courses = await CourseAdapter.findAll()
    coursePages = courses.map((course) => ({
      url: `${baseUrl}/courses/${course.id}`,
      lastModified: new Date(course.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
  } catch {
    if (!hasLoggedCourseSitemapError) {
      console.error("Sitemap course fetch failed; serving static-only entries until DB is reachable.")
      hasLoggedCourseSitemapError = true
    }
  }

  // Dynamic content/resource pages
  let resourcePages: MetadataRoute.Sitemap = []
  try {
    // Exclude lesson resources from sitemap (they're accessed via course pages)
    const resources = await ResourceAdapter.findAll({ includeLessonResources: false })
    resourcePages = resources.map((resource) => ({
      url: `${baseUrl}/content/${resource.id}`,
      lastModified: new Date(resource.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))
  } catch {
    if (!hasLoggedResourceSitemapError) {
      console.error("Sitemap resource fetch failed; serving static-only entries until DB is reachable.")
      hasLoggedResourceSitemapError = true
    }
  }

  return [...staticPages, ...coursePages, ...resourcePages]
}
