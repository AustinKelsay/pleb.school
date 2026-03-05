import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const BreadcrumbSkeleton = () => {
  return (
    <div className="flex items-center space-x-2 text-sm">
      <Skeleton className="h-4 w-16" />
      <span className="text-muted-foreground">&bull;</span>
      <Skeleton className="h-4 w-14" />
      <span className="text-muted-foreground">&bull;</span>
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export const LessonDetailsSkeleton = () => {
  return (
    <div className="space-y-6">
      {/* Hero / nav skeleton */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>

      {/* Course context skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>

      {/* Content + sidebar grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
