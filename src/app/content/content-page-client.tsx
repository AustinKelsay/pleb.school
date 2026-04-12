"use client"

import { useMemo, useState } from "react"
import {
  Crown,
  Filter,
  X,
  FileText,
  Gift,
} from "lucide-react"

import { MainLayout } from "@/components/layout/main-layout"
import { Section } from "@/components/layout/section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ContentCard } from "@/components/ui/content-card"
import { contentTypeFilters } from "@/data/config"
import type { ContentItem } from "@/data/types"
import { useCatalogNoteRepair } from "@/hooks/useCatalogNoteRepair"
import { trackEventSafe } from "@/lib/analytics"
import { getCopy } from "@/lib/copy"

const CONTENT_TYPE_FILTER_SET = new Set(contentTypeFilters.map(({ type }) => type.toLowerCase()))
type ContentLibraryCopy = typeof import("@/lib/copy").copyConfig["contentLibrary"]
type PricingCopy = typeof import("@/lib/copy").copyConfig["pricing"]

interface ContentPageClientProps {
  initialItems: ContentItem[]
  initialAvailableTags: string[]
  contentLibrary: ContentLibraryCopy
  pricing: PricingCopy
}

export default function ContentPageClient({
  initialItems,
  initialAvailableTags,
  contentLibrary,
  pricing,
}: ContentPageClientProps) {
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(["all"]))
  const repairedItems = useCatalogNoteRepair(initialItems)

  const availableTagsSet = useMemo(
    () => new Set(initialAvailableTags.map((tag) => tag.toLowerCase())),
    [initialAvailableTags]
  )

  const normalizeFilterCategory = (
    filter: string
  ): "all" | "content_type" | "price_tier" | "user_tag" | "unknown" => {
    const normalizedFilter = filter.toLowerCase().trim()
    if (normalizedFilter === "all") return "all"
    if (CONTENT_TYPE_FILTER_SET.has(normalizedFilter)) return "content_type"
    if (normalizedFilter === "free" || normalizedFilter === "premium") return "price_tier"
    if (availableTagsSet.has(normalizedFilter)) return "user_tag"
    return "unknown"
  }

  const normalizeFilterKey = (filter: string): string => filter.toLowerCase().trim()
  const isFilterSelected = (filter: string): boolean => selectedFilters.has(normalizeFilterKey(filter))

  const filteredContent = useMemo(() => {
    if (selectedFilters.has("all") || selectedFilters.size === 0) {
      return repairedItems
    }

    return repairedItems.filter((item) => {
      const itemAttributes = [
        item.type,
        item.category,
        ...item.topics.map((topic) => topic.toLowerCase()),
        item.isPremium ? "premium" : "free",
      ]

      return Array.from(selectedFilters).some((filter) =>
        itemAttributes.includes(filter.toLowerCase())
      )
    })
  }, [repairedItems, selectedFilters])

  const toggleFilter = (filter: string) => {
    const normalizedFilter = normalizeFilterKey(filter)
    const newFilters = new Set(selectedFilters)
    const filterWasSelected = selectedFilters.has(normalizedFilter)

    if (normalizedFilter === "all") {
      setSelectedFilters(new Set(["all"]))
    } else {
      newFilters.delete("all")
      if (newFilters.has(normalizedFilter)) {
        newFilters.delete(normalizedFilter)
      } else {
        newFilters.add(normalizedFilter)
      }

      if (newFilters.size === 0) {
        newFilters.add("all")
      }

      setSelectedFilters(newFilters)
    }

    trackEventSafe("content_filter_toggled", {
      filter: normalizeFilterCategory(normalizedFilter),
      was_selected: filterWasSelected,
      selected_count: normalizedFilter === "all" ? 1 : newFilters.size,
    })
  }

  const clearAllFilters = () => {
    trackEventSafe("content_filters_cleared", {
      selected_count: selectedFilters.size,
    })
    setSelectedFilters(new Set(["all"]))
  }

  return (
    <MainLayout>
      <Section spacing="lg" className="border-b">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{contentLibrary.title}</h1>
            <p className="text-muted-foreground">{contentLibrary.description}</p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {getCopy("contentLibrary.resultsCounter", {
                count: filteredContent.length,
                total: repairedItems.length,
              })}
            </p>
            {selectedFilters.size > 1 || !selectedFilters.has("all") ? (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-2" />
                {contentLibrary.filters.clearFilters}
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section spacing="sm" className="border-b bg-secondary/20">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{contentLibrary.filters.label}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant={isFilterSelected("all") ? "default" : "outline"}
              className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => toggleFilter("all")}
            >
              {contentLibrary.filters.allContent}
            </Badge>

            <div className="flex flex-wrap gap-2">
              {contentTypeFilters.map(({ type, icon: Icon, label }) => (
                <Badge
                  key={type}
                  variant={isFilterSelected(type) ? "default" : "outline"}
                  className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter(type)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                variant={isFilterSelected("free") ? "default" : "outline"}
                className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleFilter("free")}
              >
                <Gift className="h-3 w-3 mr-1" />
                {pricing.free}
              </Badge>
              <Badge
                variant={isFilterSelected("premium") ? "default" : "outline"}
                className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => toggleFilter("premium")}
              >
                <Crown className="h-3 w-3 mr-1" />
                {pricing.premium}
              </Badge>
            </div>

            {initialAvailableTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {initialAvailableTags.slice(0, 12).map((tag) => (
                  <Badge
                    key={tag}
                    variant={isFilterSelected(tag) ? "default" : "outline"}
                    className="px-4 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleFilter(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      <Section spacing="lg">
        {filteredContent.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{contentLibrary.emptyState.title}</h3>
            <p className="text-muted-foreground mb-4">{contentLibrary.emptyState.description}</p>
            <Button variant="outline" onClick={clearAllFilters}>
              {contentLibrary.emptyState.button}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContent.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                variant="content"
                onTagClick={toggleFilter}
                showContentTypeTags={true}
                engagementMode="off"
              />
            ))}
          </div>
        )}
      </Section>
    </MainLayout>
  )
}
