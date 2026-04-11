import type { Metadata } from 'next'

interface LayoutProps {
  children: React.ReactNode
}

export const metadata: Metadata = {
  title: 'Content | pleb.school',
  description: 'View content on pleb.school',
  openGraph: {
    title: 'Content',
    description: 'View content on pleb.school',
    type: 'article',
    siteName: 'pleb.school',
  },
  twitter: {
    card: 'summary',
    title: 'Content',
    description: 'View content on pleb.school',
  },
}

export default function ContentLayout({ children }: LayoutProps) {
  return children
}
