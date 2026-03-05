"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * General-purpose draft page skeleton for loading states.
 * Use when a draft page (resource or course) is loading.
 */
export const DraftPageSkeleton = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    </div>
  )
}

/**
 * Drafts list skeleton for the main drafts page.
 */
export const DraftsListSkeleton = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-40 w-full" />
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export const DraftContentSkeleton = () => {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <Skeleton className="h-40 w-full" />
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-32 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="aspect-video w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export const DraftLessonSkeleton = () => {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex flex-wrap gap-2 text-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardContent>
      </Card>

      <Tabs value="content">
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="content">
            <Skeleton className="h-4 w-20" />
          </TabsTrigger>
          <TabsTrigger value="resources">
            <Skeleton className="h-4 w-24" />
          </TabsTrigger>
          <TabsTrigger value="notes">
            <Skeleton className="h-4 w-16" />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="aspect-video w-full rounded-lg" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
