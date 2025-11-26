import { MainLayout } from '@/components/layout/main-layout'
import { Section } from '@/components/layout/section'
import { ResourcePageSkeleton } from '@/app/content/components/resource-skeletons'

/**
 * Loading component for resource detail page
 * Shows skeleton UI while resource data is being fetched
 */
export default function ResourceLoading() {
  return (
    <MainLayout>
      <Section spacing="lg">
        <ResourcePageSkeleton />
      </Section>
    </MainLayout>
  )
}
