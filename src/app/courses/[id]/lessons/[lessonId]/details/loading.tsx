import { MainLayout } from "@/components/layout/main-layout"
import { Section } from "@/components/layout/section"
import { BreadcrumbSkeleton, LessonDetailsSkeleton } from "./lesson-details-skeleton"

export default function LessonDetailsLoading() {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6">
          <BreadcrumbSkeleton />
          <LessonDetailsSkeleton />
        </div>
      </Section>
    </MainLayout>
  )
}
