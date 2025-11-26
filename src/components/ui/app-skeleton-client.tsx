"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function DraftContentSkeleton() {
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

export function DraftLessonSkeleton() {
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
