import contentConfig from "../../config/content.json"
import type { RelaySet } from "@/lib/nostr-relays"
import { getIcon, type LucideIcon } from "@/lib/icons-config"

export type PriceFilter = "all" | "free" | "paid"
export type SortOption = "newest" | "oldest" | "price-low" | "price-high" | "popular"
export type ContentType = "courses" | "documents" | "videos"

export interface CarouselConfig {
  itemsPerView: {
    mobile: number
    tablet: number
    desktop: number
  }
  autoplay: boolean
  loop: boolean
}

export interface ContentSectionFilters {
  priceFilter: PriceFilter
  categories: string[]
  maxItems: number
  sortBy: SortOption
}

export interface ContentSection {
  enabled: boolean
  title: string
  description: string
  filters: ContentSectionFilters
  carousel: CarouselConfig
}

export interface HomepageConfig {
  sections: {
    courses: ContentSection
    documents: ContentSection
    videos: ContentSection
  }
  sectionOrder: ContentType[]
}

export interface ContentPageConfig {
  filters: {
    defaultView: "grid" | "list"
    itemsPerPage: number
    enableSearch: boolean
    enableFilters: boolean
    enableSorting: boolean
  }
  includeLessonResources?: {
    videos: boolean
    documents: boolean
  }
  imageFetch?: {
    relaySet?: RelaySet
    maxConcurrentFetches?: number
  }
}

export interface GlobalConfig {
  categories: string[]
  priceFilterOptions: Record<PriceFilter, string>
  sortOptions: Record<SortOption, string>
}

export interface ContentConfig {
  homepage: HomepageConfig
  contentPage: ContentPageConfig
  global: GlobalConfig
}

export function getContentConfig(): ContentConfig {
  return contentConfig as ContentConfig
}

export function getHomepageSectionConfig(section: ContentType): ContentSection | null {
  const config = getContentConfig()
  return config.homepage.sections[section] || null
}

export function getEnabledHomepageSections(): ContentType[] {
  const config = getContentConfig()
  return config.homepage.sectionOrder.filter(
    section => config.homepage.sections[section]?.enabled
  )
}

export function filterContentByPrice<T extends { price: number }>(
  items: T[],
  priceFilter: PriceFilter
): T[] {
  switch (priceFilter) {
    case "free":
      return items.filter(item => item.price === 0)
    case "paid":
      return items.filter(item => item.price > 0)
    case "all":
    default:
      return items
  }
}

export function filterContentByCategories<T extends { category?: string }>(
  items: T[],
  categories: string[]
): T[] {
  if (!categories.length) return items
  return items.filter(item => item.category && categories.includes(item.category))
}

export function sortContent<T extends { createdAt: string; price: number; enrollmentCount?: number; viewCount?: number }>(
  items: T[],
  sortBy: SortOption
): T[] {
  const sorted = [...items]
  
  switch (sortBy) {
    case "newest":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case "price-low":
      return sorted.sort((a, b) => a.price - b.price)
    case "price-high":
      return sorted.sort((a, b) => b.price - a.price)
    case "popular":
      return sorted.sort((a, b) => {
        const aPopularity = (a.enrollmentCount || 0) + (a.viewCount || 0)
        const bPopularity = (b.enrollmentCount || 0) + (b.viewCount || 0)
        return bPopularity - aPopularity
      })
    default:
      return sorted
  }
}

export function applyContentFilters<T extends { price: number; category?: string; createdAt: string; enrollmentCount?: number; viewCount?: number }>(
  items: T[],
  filters: ContentSectionFilters
): T[] {
  let filtered = items
  
  // Apply price filter
  filtered = filterContentByPrice(filtered, filters.priceFilter)
  
  // Apply category filter
  if (filters.categories.length > 0) {
    filtered = filterContentByCategories(filtered, filters.categories)
  }
  
  // Apply sorting
  filtered = sortContent(filtered, filters.sortBy)
  
  // Apply max items limit
  return filtered.slice(0, filters.maxItems)
}

// ============================================================================
// Icon Configuration
// ============================================================================

interface IconsConfig {
  contentTypes: Record<string, string>
  categories: Record<string, string>
}

/**
 * Get icons configuration from content.json
 */
export function getIconsConfig(): IconsConfig {
  return (contentConfig as { icons: IconsConfig }).icons
}

/**
 * Get the icon for a content type
 * @param contentType - Content type key (course, video, document)
 * @returns LucideIcon component
 */
export function getContentTypeIcon(contentType: string): LucideIcon {
  const icons = getIconsConfig()
  const iconName = icons.contentTypes[contentType] || "FileText"
  return getIcon(iconName, "FileText")
}

/**
 * Get the icon for a category
 * @param category - Category key (bitcoin, lightning, nostr, etc.)
 * @returns LucideIcon component
 */
export function getCategoryIcon(category: string): LucideIcon {
  const icons = getIconsConfig()
  const iconName = icons.categories[category] || "Tag"
  return getIcon(iconName, "Tag")
}

/**
 * Get all content type icons as a record
 * Useful for components that need to iterate over all icons
 */
export function getAllContentTypeIcons(): Record<string, LucideIcon> {
  const icons = getIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [type, iconName] of Object.entries(icons.contentTypes)) {
    result[type] = getIcon(iconName, "FileText")
  }
  return result
}

/**
 * Get all category icons as a record
 */
export function getAllCategoryIcons(): Record<string, LucideIcon> {
  const icons = getIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [category, iconName] of Object.entries(icons.categories)) {
    result[category] = getIcon(iconName, "Tag")
  }
  return result
}
