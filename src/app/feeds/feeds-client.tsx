"use client"

import { BellRing, Rss, Sparkles } from "lucide-react"
import { Container } from "@/components/layout/container"
import { ComingSoonPlaceholder } from "@/components/placeholders/coming-soon"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { copyConfig } from "@/lib/copy"
import { CommunityFeed } from "./community-feed"

const feedsCopy = copyConfig.feeds

export function FeedsClient() {
  const highlights = feedsCopy?.highlights
  const cta = feedsCopy?.cta

  return (
    <Container className="py-8 sm:py-10">
      <Tabs defaultValue="community">
        <TabsList>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="activity" disabled>Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="community">
          <CommunityFeed />
        </TabsContent>
        <TabsContent value="activity">
          <div className="pt-6">
            <ComingSoonPlaceholder
              title="Activity feed coming soon"
              description="Aggregated activity from across the platform — new content, zaps, and more."
              highlights={[
                {
                  icon: Rss,
                  title: highlights?.sources?.title ?? "Smart sources",
                  description: highlights?.sources?.description ?? "Blend editorial picks, enrolled courses, and tagged Nostr events into a single configurable stream.",
                },
                {
                  icon: BellRing,
                  title: highlights?.alerts?.title ?? "Real-time alerts",
                  description: highlights?.alerts?.description ?? "Surface new lessons, drops, and releases as soon as they hit your relays.",
                },
                {
                  icon: Sparkles,
                  title: highlights?.adaptive?.title ?? "Adaptive signal",
                  description: highlights?.adaptive?.description ?? "Experiment with scoring and personalization while keeping your content portable on Nostr.",
                },
              ]}
              primaryCta={cta?.primary ?? { label: "Browse demo courses", href: "/content" }}
              secondaryCta={cta?.secondary ?? { label: "Back to home", href: "/" }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </Container>
  )
}
