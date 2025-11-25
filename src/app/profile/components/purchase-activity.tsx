"use client"

import { Info } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PurchaseList } from "@/components/purchase/purchase-list"

export function PurchaseActivityTab() {
  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <CardTitle>Purchase activity</CardTitle>
          </div>
          <CardDescription>
            See every course and resource you have paid for, with stored zap receipts and the full lifecycle of each purchase.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Purchases unlock once your paid zaps meet the sticker price. We keep the receipts and timestamps so you can trace every payment.
        </CardContent>
      </Card>

      <PurchaseList scope="mine" showSummary showUser={false} />
    </div>
  )
}
