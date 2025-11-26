"use client"

import { useState } from "react"
import type { ComponentType } from "react"
import { Activity, BarChart3, Heart, MessageSquare, Users, Wallet, Zap } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PurchaseList } from "@/components/purchase/purchase-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { usePurchasesQuery } from "@/hooks/usePurchasesQuery"

export function AdminAnalyticsTabs() {
  const [tab, setTab] = useState<"purchases" | "comments" | "interactions">("purchases")
  return (
    <Card className="border-border/80 bg-card/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>Platform-wide insights for admins.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="interactions">Interactions</TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            <AdminPurchaseAnalytics />
          </TabsContent>

          <TabsContent value="comments">
            <PlaceholderPanel
              icon={MessageSquare}
              title="Comments analytics coming soon"
              description="We’ll surface counts, trends, and moderation insights across all content."
            />
          </TabsContent>

          <TabsContent value="interactions">
            <PlaceholderPanel
              icon={Activity}
              title="Nostr interactions analytics coming soon"
              description="Likes, boosts, and zap insights for your content will appear here."
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export function AdminPurchaseAnalytics() {
  const { data, isLoading, isError, error, refetch } = usePurchasesQuery({ scope: "all" })
  const stats = data?.stats ?? null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats ? (
          <>
            <MetricCard icon={Wallet} label="Revenue" value={formatSatsValue(stats.totalRevenueSats)} />
            <MetricCard icon={Zap} label="Purchases" value={stats.totalPurchases.toLocaleString()} />
            <MetricCard icon={Users} label="Buyers" value={stats.buyers.toLocaleString()} />
            <MetricCard icon={BarChart3} label="Avg ticket" value={formatSatsValue(stats.averageTicketSats)} />
          </>
        ) : (
          [0, 1, 2, 3].map((idx) => <Skeleton key={idx} className="h-24 w-full" />)
        )}
      </div>

      <PurchaseList
        scope="all"
        showSummary
        showUser
        purchases={data?.purchases ?? []}
        stats={stats}
        isLoading={isLoading}
        error={isError ? error?.message ?? "Failed to load purchases" : null}
        refetch={refetch}
        emptyMessage="No purchases recorded yet."
      />
    </div>
  )
}

type MetricProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}

function formatSatsValue(value: number) {
  return `${value.toLocaleString()} sats`
}

function MetricCard({ icon: Icon, label, value }: MetricProps) {
  return (
    <Card className="border-border/80 bg-card/70 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  )
}

function PlaceholderPanel({
  icon: Icon,
  title,
  description
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <Alert className="border-dashed bg-muted/40">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </div>
      </div>
    </Alert>
  )
}
