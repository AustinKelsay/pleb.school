import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { HeroAnimated } from "@/components/ui/hero-animated"
import { MainLayout, Section } from "@/components/layout"
import {
  BookOpen,
  Video,
  Zap,
  ExternalLink,
  Sparkles,
  CheckCircle,
  Eye,
  Settings
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import * as Icons from "lucide-react"
import Link from "next/link"

import { CoursesSection } from "@/components/homepage/courses-section"
import { VideosSection } from "@/components/homepage/videos-section"
import { DocumentsSection } from "@/components/homepage/documents-section"
import { HomepageWithPrefetch } from "@/components/homepage/homepage-with-prefetch"
import { useCopy } from "@/lib/copy"
import { getEnabledHomepageSections } from "@/lib/content-config"

interface HeroStat {
  value: string
  label: string
  icon: LucideIcon
}

type HomepageStatConfig = {
  value: string
  label: string
  icon?: string
}

type HomepageStatsConfig = HomepageStatConfig[] | Record<string, HomepageStatConfig>

function normalizeHomepageStats(stats: unknown): HomepageStatConfig[] {
  if (!stats || typeof stats !== "object") {
    return []
  }

  if (Array.isArray(stats)) {
    return stats.filter(
      (stat): stat is HomepageStatConfig =>
        !!stat &&
        typeof stat === "object" &&
        "value" in stat &&
        "label" in stat
    )
  }

  return Object.values(stats as HomepageStatsConfig).filter(
    (stat): stat is HomepageStatConfig =>
      !!stat &&
      typeof stat === "object" &&
      "value" in stat &&
      "label" in stat
  )
}

function getStatIconComponent(iconName?: string): LucideIcon {
  const fallbackIcon = Icons.Users as LucideIcon

  if (!iconName) {
    return fallbackIcon
  }

  const maybeIcon = (Icons as Record<string, unknown>)[iconName]

  if (maybeIcon) {
    return maybeIcon as LucideIcon
  }

  return fallbackIcon
}

/**
 * Homepage component showcasing content and features
 * Uses dynamic data fetching and caching for performance
 */
export default function Home() {
  const { homepage } = useCopy()
  const heroStatsConfig = normalizeHomepageStats(homepage.stats as unknown)

  const heroStats: HeroStat[] = heroStatsConfig.map((stat) => ({
    value: stat.value,
    label: stat.label,
    icon: getStatIconComponent(stat.icon)
  }))

  const watchDemoHref = homepage.hero.buttons.watchDemoHref || "/demo"
  const isExternalWatchDemoHref = /^https?:\/\//i.test(watchDemoHref)
  const heroVideoUrl = homepage.visual.videoUrl
  const heroVideoPoster = homepage.visual.videoPoster

  return (
    <HomepageWithPrefetch>
      <MainLayout>
        {/* Hero Section */}
        <Section
          spacing="xl"
          className="bg-gradient-to-b from-background to-muted/50"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
            {/* Content */}
            <div className="space-y-4 sm:space-y-6 lg:space-y-8">
              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                <Badge variant="outline" className="w-fit">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {homepage.hero.badge}
                </Badge>

                <HeroAnimated />

                <p className="text-sm sm:text-base lg:text-lg text-muted-foreground max-w-2xl">
                  {homepage.hero.description}
                </p>
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4">
                <Link href="/courses">
                  <Button size="lg" className="w-full sm:w-auto sm:flex-none">
                    <BookOpen className="h-4 w-4 mr-2" />
                    {homepage.hero.buttons.startLearning}
                  </Button>
                </Link>
                {isExternalWatchDemoHref ? (
                  <a href={watchDemoHref} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto sm:flex-none">
                      <Video className="h-4 w-4 mr-2" />
                      {homepage.hero.buttons.watchDemo}
                    </Button>
                  </a>
                ) : (
                  <Link href={watchDemoHref}>
                    <Button variant="outline" size="lg" className="w-full sm:w-auto sm:flex-none">
                      <Video className="h-4 w-4 mr-2" />
                      {homepage.hero.buttons.watchDemo}
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Visual */}
            <div className="relative order-first lg:order-last mb-4 sm:mb-0">
              {heroVideoUrl ? (
                <div className="aspect-video rounded-lg border border-border overflow-hidden bg-black">
                  <video
                    className="h-full w-full object-cover"
                    src={heroVideoUrl}
                    poster={heroVideoPoster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                    aria-label="Homepage hero video preview"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center border border-border">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 lg:h-20 w-16 lg:w-20 items-center justify-center rounded-full bg-primary/20">
                      <Zap className="h-8 lg:h-10 w-8 lg:w-10 text-primary" />
                    </div>
                    <p className="text-sm lg:text-base text-muted-foreground">{homepage.visual.screenLabel}</p>
                  </div>
                </div>
              )}

              {/* Floating content type cards */}
              <div className="absolute -top-1 sm:-top-2 lg:-top-4 -right-1 sm:-right-2 lg:-right-4 z-10">
                <Card className="w-28 sm:w-32 lg:w-36 p-1.5 sm:p-2 lg:p-3 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-2">
                    <Eye className="h-2.5 sm:h-3 lg:h-4 w-2.5 sm:w-3 lg:w-4 text-primary" />
                    <span className="text-xs font-medium">{homepage.visual.primaryBadge}</span>
                  </div>
                </Card>
              </div>

              <div className="absolute -bottom-1 sm:-bottom-2 lg:-bottom-4 -left-1 sm:-left-2 lg:-left-4 z-10">
                <Card className="w-32 sm:w-36 lg:w-40 p-1.5 sm:p-2 lg:p-3 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-2">
                    <Settings className="h-2.5 sm:h-3 lg:h-4 w-2.5 sm:w-3 lg:w-4 text-primary" />
                    <span className="text-xs font-medium">{homepage.visual.secondaryBadge}</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Stats/Features Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-8 sm:mt-10 lg:mt-12">
            {heroStats.map((stat, index) => (
              <Card 
                key={index} 
                className="flex flex-col items-center text-center p-4 gap-2 transition-all duration-200 hover:shadow-md hover:border-primary/20 bg-card/80 backdrop-blur-sm"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-lg sm:text-xl tracking-tight text-foreground">{stat.value}</h3>
                  <p className="text-sm text-muted-foreground text-balance leading-relaxed font-medium">{stat.label}</p>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        {/* Dynamic Content Sections */}
        <HomepageContent />

        {/* CTA Section */}
        <Section spacing="lg" className="bg-muted/50">
          <div className="text-center space-y-4 sm:space-y-6">
            <div className="space-y-1 sm:space-y-2">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold">{homepage.cta.title}</h2>
              <p className="text-sm lg:text-base text-muted-foreground max-w-2xl mx-auto">
                {homepage.cta.description}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4 justify-center">
              <Link href="/auth/signin">
                <Button size="lg" className="w-full sm:w-auto sm:min-w-[140px]">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {homepage.cta.buttons.getStarted}
                </Button>
              </Link>
              <Link href="/courses">
                <Button variant="outline" size="lg" className="w-full sm:w-auto sm:min-w-[140px]">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {homepage.cta.buttons.viewCourses}
                </Button>
              </Link>
            </div>
          </div>
        </Section>
      </MainLayout>
    </HomepageWithPrefetch>
  )
}

/**
 * Dynamic content sections with server-side data fetching
 * Shows featured courses, videos, and documents based on configuration
 */
async function HomepageContent() {
  const enabledSections = getEnabledHomepageSections()

  const sectionComponents = {
    courses: CoursesSection,
    documents: DocumentsSection,
    videos: VideosSection
  }

  return (
    <>
      {enabledSections.map((sectionType) => {
        const SectionComponent = sectionComponents[sectionType]
        return SectionComponent ? <SectionComponent key={sectionType} /> : null
      })}
    </>
  )
}
