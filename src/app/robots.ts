import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXTAUTH_URL || 'https://pleb.school').replace(/\/+$/, '')

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/drafts/', '/settings/', '/create/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
