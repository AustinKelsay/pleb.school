import { MainLayout } from "@/components/layout/main-layout"
import { Section } from "@/components/layout/section"
import { ContentPageSkeleton } from "@/components/ui/content-skeleton"

export default function ContentLoading() {
  return (
    <MainLayout>
      <Section spacing="lg">
        <ContentPageSkeleton />
      </Section>
    </MainLayout>
  )
}
