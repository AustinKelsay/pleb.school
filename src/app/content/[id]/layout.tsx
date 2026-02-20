import type { Metadata } from 'next'
import { ResourceAdapter } from '@/lib/db-adapter'
import { parseEvent } from '@/data/types'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params

  // Only fetch for UUID resource IDs (database resources)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return {
      title: 'Content | pleb.school',
      description: 'View content on pleb.school',
    }
  }

  try {
    const resource = await ResourceAdapter.findByIdWithNote(id)
    if (!resource) {
      return {
        title: 'Content Not Found | pleb.school',
        description: 'The requested content could not be found.',
      }
    }

    // Parse Nostr note if available for richer metadata
    let title = 'Content'
    let description = 'View content on pleb.school'
    let image: string | undefined

    if (resource.note) {
      try {
        const parsed = parseEvent(resource.note)
        title = parsed.title || title
        description = parsed.summary || description
        image = parsed.image
      } catch {
        // Use defaults if parsing fails
      }
    }

    const metadata: Metadata = {
      title: `${title} | pleb.school`,
      description: description.slice(0, 160),
      openGraph: {
        title,
        description: description.slice(0, 160),
        type: 'article',
        siteName: 'pleb.school',
        ...(image && { images: [{ url: image }] }),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title,
        description: description.slice(0, 160),
        ...(image && { images: [image] }),
      },
    }

    return metadata
  } catch (error) {
    console.error('Error generating content metadata:', error)
    return {
      title: 'Content | pleb.school',
      description: 'View content on pleb.school',
    }
  }
}

export default function ContentLayout({ children }: LayoutProps) {
  return children
}
