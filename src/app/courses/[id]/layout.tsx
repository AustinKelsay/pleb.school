import type { Metadata } from 'next'

interface LayoutProps {
  children: React.ReactNode
}

export function generateMetadata(): Metadata {
  return {
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
}

export default function CourseLayout({ children }: LayoutProps) {
  return children
}
