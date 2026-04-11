import { notFound } from 'next/navigation'
import { CourseAdapter } from '@/lib/db-adapter'

import CoursePageClient from './course-page-client'

interface CoursePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params
  const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  if (isUuidId) {
    const courseExists = await CourseAdapter.exists(id)
    if (!courseExists) {
      notFound()
    }
  }

  return <CoursePageClient courseId={id} />
}
