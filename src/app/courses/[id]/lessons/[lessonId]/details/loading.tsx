import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { Skeleton } from '@/components/ui/skeleton'
import { LessonDetailsSkeleton } from './lesson-details-skeleton'

export default function LessonDetailsLoading() {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 text-sm">
            <Skeleton className="h-4 w-16" />
            <span className="text-muted-foreground">&bull;</span>
            <Skeleton className="h-4 w-14" />
            <span className="text-muted-foreground">&bull;</span>
            <Skeleton className="h-4 w-24" />
          </div>

          <LessonDetailsSkeleton />
        </div>
      </Section>
    </MainLayout>
  )
}
