import LessonDetailsPageClient from './lesson-details-page-client'

interface LessonDetailsPageProps {
  params: Promise<{
    id: string
    lessonId: string
  }>
}

export default async function LessonDetailsPage({ params }: LessonDetailsPageProps) {
  const { id, lessonId } = await params

  return <LessonDetailsPageClient courseId={id} lessonId={lessonId} />
}
