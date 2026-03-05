import { MainLayout } from "@/components/layout"
import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"
import { ProfileOverviewSkeleton } from "./components/profile-skeletons"

export default function ProfileLoading() {
  return (
    <MainLayout>
      <Container className="py-10 sm:py-12">
        <div className="flex flex-col gap-8">
          {/* Page Header */}
          <div className="space-y-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>

          {/* Tab bar */}
          <div className="inline-flex gap-2 rounded-xl border border-border bg-card/60 p-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-28 rounded-lg" />
            ))}
          </div>

          {/* Default tab content (profile overview) */}
          <ProfileOverviewSkeleton />
        </div>
      </Container>
    </MainLayout>
  )
}
