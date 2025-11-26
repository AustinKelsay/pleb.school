"use client"

import { Info } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PurchaseList } from "@/components/purchase/purchase-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { ComponentType } from "react"
import { Activity, Heart, MessageSquare, Zap } from "lucide-react"

export function PurchaseActivityTab() {
  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <CardTitle>Your interactions</CardTitle>
          </div>
          <CardDescription>
            View everything you’ve done on PlebDev: purchases, comments, and reactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="purchases" className="mt-2">
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="likes">Likes</TabsTrigger>
            </TabsList>

            <TabsContent value="purchases" className="space-y-4">
              <PurchaseList scope="mine" showSummary showUser={false} />
            </TabsContent>

            <TabsContent value="comments">
              <PlaceholderPanel
                icon={MessageSquare}
                title="Comments activity coming soon"
                description="You’ll see your recent comments and replies across courses and content here."
              />
            </TabsContent>

            <TabsContent value="likes">
              <PlaceholderPanel
                icon={Heart}
                title="Likes & reactions coming soon"
                description="We’ll surface your Nostr likes, boosts, and zaps across content."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
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
