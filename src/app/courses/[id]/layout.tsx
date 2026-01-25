import type { Metadata } from 'next'
import { CourseAdapter } from '@/lib/db-adapter'
import { parseCourseEvent } from '@/data/types'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params

  // Only fetch for UUID course IDs (database courses)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return {
      title: 'Course | pleb.school',
      description: 'View course on pleb.school',
    }
  }

  try {
    const course = await CourseAdapter.findByIdWithNote(id)
    if (!course) {
      return {
        title: 'Course Not Found | pleb.school',
        description: 'The requested course could not be found.',
      }
    }

    // Parse Nostr note if available for richer metadata
    let title = 'Course'
    let description = 'View course on pleb.school'
    let image: string | undefined

    if (course.note) {
      try {
        const parsed = parseCourseEvent(course.note)
        title = parsed.title || title
        description = parsed.description || description
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
        type: 'website',
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
    console.error('Error generating course metadata:', error)
    return {
      title: 'Course | pleb.school',
      description: 'View course on pleb.school',
    }
  }
}

export default function CourseLayout({ children }: LayoutProps) {
  return children
}
