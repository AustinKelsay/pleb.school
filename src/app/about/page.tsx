import type { Metadata } from "next"
import Link from "next/link"
import { GitFork, Network, Settings2 } from "lucide-react"
import type { ComponentType } from "react"

import { MainLayout, Section } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { copyConfig } from "@/lib/copy"

const aboutCopy = copyConfig.about

export const metadata: Metadata = {
  title: `About ${copyConfig.site.brandName}`,
  description:
    aboutCopy?.hero?.description ??
    "Learn how this configurable, Nostr-native education platform works and how to run your own instance."
}

export default function AboutPage() {
  const hero = aboutCopy?.hero
  const sections = aboutCopy?.sections
  const steps = aboutCopy?.steps
  const cta = aboutCopy?.cta
  const hasPrimaryCta = Boolean(cta?.primary?.href && cta?.primary?.label)
  const hasSecondaryCta = Boolean(cta?.secondary?.href && cta?.secondary?.label)

  return (
    <MainLayout>
      {/* Hero */}
      <Section spacing="xl">
        <div className="space-y-10 max-w-5xl mx-auto">
          <div className="space-y-4 text-center">
            {hero?.badge ? (
              <Badge variant="outline" className="mx-auto w-fit">
                {hero.badge}
              </Badge>
            ) : null}
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                {hero?.title ?? "A configurable, open education platform"}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-3xl mx-auto">
                {hero?.description ??
                  "This stack is designed to be forked, re-themed, and wired to your own Nostr relays, auth, and content model with minimal code changes."}
              </p>
            </div>
          </div>

          {/* Pillars */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            <AboutCard
              icon={GitFork}
              title={sections?.creators?.title ?? "Creators & communities"}
              description={
                sections?.creators?.description ??
                "Spin up a white-label academy on your own domain. Configure branding, navigation, and copy from JSON without touching business logic."
              }
            />
            <AboutCard
              icon={Network}
              title={sections?.platform?.title ?? "Nostr-native architecture"}
              description={
                sections?.platform?.description ??
                "Connect to real Nostr relays, Lightning zaps, and a Postgres-backed auth layer. Keep content portable while your UI stays familiar."
              }
            />
            <AboutCard
              icon={Settings2}
              title={sections?.learners?.title ?? "Built to be configured"}
              description={
                sections?.learners?.description ??
                "Ship fast with sane defaults, then customize theme, copy, relays, and content settings under the config/ directory."
              }
            />
          </div>
        </div>
      </Section>

      {/* How to make it yours */}
      <Section spacing="lg" className="bg-muted/50">
        <div className="max-w-4xl mx-auto space-y-6 text-center">
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {cta?.title ?? "Make this platform your own"}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground max-w-3xl mx-auto">
              {cta?.description ??
                "Fork the repo, tweak the JSON configs under config/, and deploy to your favorite host. The core stack handles routing, data fetching, and Nostr integration for you."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 text-left">
            <Card className="p-4 space-y-2">
              <h3 className="font-medium text-foreground">
                {steps?.fork?.title ?? "1. Fork & clone"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {steps?.fork?.description ?? "Create your own repository and clone it locally. Keep upstream changes in a branch if you want to stay close to the reference implementation."}
              </p>
            </Card>
            <Card className="p-4 space-y-2">
              <h3 className="font-medium text-foreground">
                {steps?.configure?.title ?? "2. Configure branding & relays"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {steps?.configure?.description ?? "Update `config/copy.json`, `config/content.json`, and `config/nostr.json` to match your brand, navigation, content sections, and relay setup."}
              </p>
            </Card>
            <Card className="p-4 space-y-2">
              <h3 className="font-medium text-foreground">
                {steps?.deploy?.title ?? "3. Deploy your instance"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {steps?.deploy?.description ?? "Point your environment variables at your Postgres instance and Nostr relays, then deploy to Vercel, Fly.io, or your preferred platform."}
              </p>
            </Card>
          </div>

          {(hasPrimaryCta || hasSecondaryCta) && (
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-center pt-2">
              {cta?.primary?.href && cta.primary.label ? (
                <Button size="lg" className="w-full sm:w-auto" asChild>
                  <Link href={cta.primary.href}>{cta.primary.label}</Link>
                </Button>
              ) : null}
              {cta?.secondary?.href && cta.secondary.label ? (
                <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href={cta.secondary.href}>{cta.secondary.label}</Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Section>
    </MainLayout>
  )
}

interface AboutCardProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}

function AboutCard({ icon: Icon, title, description }: AboutCardProps) {
  return (
    <Card className="h-full border-border bg-background/60 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  )
}
