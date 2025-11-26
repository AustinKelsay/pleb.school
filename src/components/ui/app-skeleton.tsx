import { MainLayout } from "@/components/layout/main-layout"
import { Section } from "@/components/layout/section"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const StatSkeleton = () => {
  return (
    <Card className="flex flex-col items-center text-center p-4 gap-2 bg-card/80 backdrop-blur-sm">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
      <div className="space-y-2 w-full">
        <Skeleton className="h-5 w-16 mx-auto" />
        <Skeleton className="h-3 w-24 mx-auto" />
      </div>
    </Card>
  )
}

export const LandingPageSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="xl" className="bg-gradient-to-b from-background to-muted/50">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
          <div className="space-y-6 sm:space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-5/6" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
              <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
            </div>
          </div>

          <div className="relative order-first lg:order-last">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <div className="absolute -top-3 -right-3">
              <Card className="p-3 w-32 shadow-sm">
                <Skeleton className="h-4 w-20" />
              </Card>
            </div>
            <div className="absolute -bottom-3 -left-3">
              <Card className="p-3 w-36 shadow-sm">
                <Skeleton className="h-4 w-24" />
              </Card>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      </Section>

      <Section spacing="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section spacing="lg" className="bg-muted/50">
        <div className="text-center space-y-4">
          <Skeleton className="h-7 w-64 mx-auto" />
          <Skeleton className="h-4 w-96 max-w-full mx-auto" />
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Skeleton className="h-11 w-44 rounded-md" />
            <Skeleton className="h-11 w-44 rounded-md" />
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}

export const InfoPageSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="xl">
        <div className="space-y-8 max-w-5xl mx-auto text-center">
          <Skeleton className="h-5 w-32 mx-auto rounded-full" />
          <div className="space-y-3">
            <Skeleton className="h-9 w-3/4 mx-auto" />
            <Skeleton className="h-5 w-2/3 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3 h-full">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </Card>
            ))}
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}

export const SearchPageSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="text-center space-y-2">
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-4 w-80 max-w-full mx-auto" />
          </div>

          <div className="max-w-2xl mx-auto">
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>

          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-14 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}

export const CourseDetailPageSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>

              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
                <Skeleton className="h-11 w-full sm:w-32 rounded-md" />
              </div>
            </div>

            <Skeleton className="aspect-video w-full rounded-xl" />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-6 w-40" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </Card>
              ))}
            </div>

            <div className="space-y-6">
              <Card className="p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            </div>
          </div>
        </div>
      </Section>
    </MainLayout>
  )
}

export const AuthCardSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="flex justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-6 w-1/2 mx-auto" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <Skeleton className="h-4 w-24 mx-auto" />
            </CardContent>
          </Card>
        </div>
      </Section>
    </MainLayout>
  )
}

export const FormCardSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="lg">
        <div className="flex justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-6 w-2/3 mx-auto" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <Skeleton className="h-10 w-full rounded-md" />
            </CardContent>
          </Card>
        </div>
      </Section>
    </MainLayout>
  )
}

export const CreatePageSkeleton = () => {
  return (
    <MainLayout>
      <Section spacing="lg" className="border-b">
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Section>
      <Section spacing="lg">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-full rounded-md" />
          <Card className="p-5 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </Card>
          <Card className="p-5 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </Card>
        </div>
      </Section>
    </MainLayout>
  )
}
