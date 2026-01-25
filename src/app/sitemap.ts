import type { MetadataRoute } from 'next'
import { CourseAdapter, ResourceAdapter } from '@/lib/db-adapter'

export const revalidate = 3600 // 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://pleb.school'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/content`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/feeds`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
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
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))
  } catch (error) {
    console.error('Error fetching courses for sitemap:', error)
  }

  // Dynamic content/resource pages
  let resourcePages: MetadataRoute.Sitemap = []
  try {
    // Exclude lesson resources from sitemap (they're accessed via course pages)
    const resources = await ResourceAdapter.findAll({ includeLessonResources: false })
    resourcePages = resources.map((resource) => ({
      url: `${baseUrl}/content/${resource.id}`,
      lastModified: new Date(resource.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch (error) {
    console.error('Error fetching resources for sitemap:', error)
  }

  return [...staticPages, ...coursePages, ...resourcePages]
}
