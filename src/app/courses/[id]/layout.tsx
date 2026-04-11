import type { Metadata } from 'next'
import { CourseAdapter } from '@/lib/db-adapter'

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
    const courseExists = await CourseAdapter.exists(id)
    if (!courseExists) {
      return {
        title: 'Course Not Found | pleb.school',
        description: 'The requested course could not be found.',
      }
    }

    const metadata: Metadata = {
      title: 'Course | pleb.school',
      description: 'View course on pleb.school',
      openGraph: {
        title: 'Course',
        description: 'View course on pleb.school',
        type: 'website',
        siteName: 'pleb.school',
      },
      twitter: {
        card: 'summary',
        title: 'Course',
        description: 'View course on pleb.school',
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
