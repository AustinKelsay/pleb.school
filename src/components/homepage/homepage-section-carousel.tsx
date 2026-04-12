"use client"

import { Section } from "@/components/layout"
import { ContentCard } from "@/components/ui/content-card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import type { ContentItem } from "@/data/types"
import { useCatalogNoteRepair } from "@/hooks/useCatalogNoteRepair"
import type { ContentSection } from "@/lib/content-config"

export interface HomepageSectionCarouselProps {
  title: string
  description: string
  items: ContentItem[]
  sectionType: "courses" | "videos" | "documents"
  carouselConfig: ContentSection["carousel"]
}

function getSectionClassName(sectionType: HomepageSectionCarouselProps["sectionType"]): string {
  return sectionType === "videos" ? "bg-background" : "bg-muted/30"
}

function getEmptyStateCopy(sectionType: HomepageSectionCarouselProps["sectionType"]): string {
  switch (sectionType) {
    case "courses":
      return "No courses available at the moment."
    case "videos":
      return "No video resources available at the moment."
    case "documents":
      return "No document resources available at the moment."
    default:
      return "No content available at the moment."
  }
}

export const HomepageSectionCarousel = ({
  title,
  description,
  items,
  sectionType,
  carouselConfig,
}: HomepageSectionCarouselProps) => {
  const repairedItems = useCatalogNoteRepair(items)

  return (
    <Section spacing="lg" className={getSectionClassName(sectionType)}>
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>

        {repairedItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{getEmptyStateCopy(sectionType)}</p>
          </div>
        ) : (
          <Carousel
            opts={{
              align: "start",
              loop: carouselConfig.loop || false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {repairedItems.map((item) => (
                <CarouselItem
                  key={item.id}
                  className={`pl-2 md:pl-4 basis-full ${
                    carouselConfig.itemsPerView.tablet === 2 ? "md:basis-1/2" : ""
                  } ${
                    carouselConfig.itemsPerView.desktop === 3
                      ? "lg:basis-1/3"
                      : carouselConfig.itemsPerView.desktop === 4
                        ? "lg:basis-1/4"
                        : "lg:basis-1/2"
                  }`}
                >
                  <ContentCard
                    item={item}
                    variant="content"
                    showContentTypeTags={false}
                    engagementMode="off"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-[-10px] translate-x-0 z-10 sm:-left-12 sm:translate-x-0" />
            <CarouselNext className="right-[-10px] translate-x-0 z-10 sm:-right-12 sm:translate-x-0" />
          </Carousel>
        )}
      </div>
    </Section>
  )
}
