import CoursePageClient from './course-page-client'

interface CoursePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { id } = await params
  return <CoursePageClient courseId={id} />
}
