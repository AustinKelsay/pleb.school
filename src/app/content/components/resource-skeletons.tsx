import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function MetaChipSkeleton({ width = "w-24" }: { width?: string }) {
  return <Skeleton className={`h-6 ${width} rounded-full`} />
}

export function ResourceOverviewCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center text-center space-y-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-56 max-w-full rounded-md" />
          <Skeleton className="h-4 w-64 max-w-full rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}

export function ResourceSidebarSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Author */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
        {/* Type */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-12 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        {/* Category */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        {/* Views */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
        {/* Created */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        {/* Nostr link button */}
        <Skeleton className="h-10 w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

export function ResourcePageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          {/* Badges - matches actual: category + type */}
          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            {/* Title */}
            <Skeleton className="h-10 w-full max-w-xl" />
            {/* Description */}
            <div className="space-y-1">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          </div>

          {/* Interaction metrics - matches actual: 3 metrics + views */}
          <div className="flex items-center flex-wrap gap-4 sm:gap-6">
            <div className="flex items-center space-x-1.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="flex items-center space-x-1.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-8" />
            </div>
            <div className="flex items-center space-x-1.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-8" />
            </div>
            <div className="flex items-center space-x-1.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>

          {/* CTA button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <Skeleton className="h-11 w-full sm:w-48 rounded-md" />
          </div>

          {/* Topics */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <Skeleton className="aspect-video w-full rounded-lg" />
        </div>
      </div>

      {/* Full width toggle */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Content & Sidebar */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ResourceOverviewCardSkeleton />
        </div>
        <div className="space-y-6">
          <ResourceSidebarSkeleton />
        </div>
      </div>

      {/* Comments placeholder */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded-md" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3 rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
                <Skeleton className="h-4 w-2/3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ResourceContentViewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero / metadata card */}
      <Card className="overflow-hidden">
        <div className="relative">
          <Skeleton className="h-40 sm:h-56 w-full rounded-none" />
        </div>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>

          <div className="space-y-3">
            <Skeleton className="h-8 w-full max-w-2xl rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
          </div>

          <div className="flex flex-wrap gap-3">
            <MetaChipSkeleton width="w-28" />
            <MetaChipSkeleton width="w-24" />
            <MetaChipSkeleton width="w-24" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Skeleton className="h-11 w-full sm:w-48 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      <Card>
        <CardContent className="space-y-5 pt-6">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Additional resources */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-5 w-44 rounded-md" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-5 w-32 rounded-md" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3 rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
