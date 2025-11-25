"use client"

import { BarChart3, Users, Wallet, Zap } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PurchaseList } from "@/components/purchase/purchase-list"
import { usePurchasesQuery } from "@/hooks/usePurchasesQuery"

export function AdminPurchaseAnalytics() {
  const { data, isLoading, isError, error, refetch } = usePurchasesQuery({ scope: "all" })
  const stats = data?.stats ?? null

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle>Purchases across the platform</CardTitle>
          </div>
          <CardDescription>
            Full visibility into every purchase, including receipt provenance. Only admins with analytics access can view this feed.
          </CardDescription>
        </CardHeader>
      </Card>

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
  icon: React.ComponentType<{ className?: string }>
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
