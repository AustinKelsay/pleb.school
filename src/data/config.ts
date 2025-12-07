import type { LucideIcon } from "lucide-react"
import { getContentTypeIcon, getAllContentTypeIcons } from "@/lib/content-config"

/**
 * Centralized UI configuration for consistent display across the application
 * Uses standard shadcn variants for colors to work with the configurable theme system
 */

/**
 * Icons mapping for different content types
 * Backed by configurable icons from config/content.json
 */
export const contentTypeIcons: Record<string, LucideIcon> = new Proxy(
  {} as Record<string, LucideIcon>,
  {
    get(_, prop: string) {
      return getContentTypeIcon(prop)
    },
    ownKeys() {
      return Object.keys(getAllContentTypeIcons())
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true }
    }
  }
)

/**
 * Popular tags for filtering
 */
export const popularTags = [
  "bitcoin",
  "lightning",
  "nostr",
  "javascript",
  "react",
  "api",
  "security",
  "frontend",
  "backend",
  "mobile",
  "cryptography",
  "web3",
  "nodejs",
  "typescript"
]

/**
 * Content type filters for UI
 * Icons are resolved from configurable icons in config/content.json
 */
export const contentTypeFilters: Array<{
  type: "course" | "video" | "document"
  icon: LucideIcon
  label: string
}> = [
  { type: "course", icon: getContentTypeIcon("course"), label: "Courses" },
  { type: "video", icon: getContentTypeIcon("video"), label: "Videos" },
  { type: "document", icon: getContentTypeIcon("document"), label: "Documents" }
] 
