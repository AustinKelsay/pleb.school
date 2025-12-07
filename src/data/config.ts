import type { LucideIcon } from "lucide-react"
import { getContentTypeIcon, getAllContentTypeIcons } from "@/lib/content-config"

/**
 * Centralized UI configuration for consistent display across the application
 * Uses standard shadcn variants for colors to work with the configurable theme system
 */

/**
 * Icons mapping for different content types
 * Now powered by configurable icons from config/content.json
 * @deprecated Use getContentTypeIcon() from @/lib/content-config instead
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
 * Badge variants for difficulty levels using standard shadcn badge variants
 * These automatically adapt to the current theme configuration
 */
export const difficultyVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  beginner: "secondary",
  intermediate: "default", 
  advanced: "destructive",
}

/**
 * Display labels for content types
 */
export const contentTypeLabels: Record<string, string> = {
  course: "Course",
  video: "Video",
  document: "Document",
}

/**
 * Display labels for difficulty levels
 */
export const difficultyLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

/**
 * Category labels for content organization
 */
export const categoryLabels: Record<string, string> = {
  bitcoin: "Bitcoin",
  lightning: "Lightning",
  nostr: "Nostr",
  frontend: "Frontend",
  backend: "Backend",
  mobile: "Mobile",
  security: "Security",
  web3: "Web3",
}

/**
 * Priority levels for content sorting
 */
export const priorityLevels: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * Content status options
 */
export const contentStatus: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
}

/**
 * Enrollment status options
 */
export const enrollmentStatus: Record<string, string> = {
  enrolled: "Enrolled",
  completed: "Completed",
  inProgress: "In Progress",
  notStarted: "Not Started",
}

/**
 * Payment status options
 */
export const paymentStatus: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
  refunded: "Refunded",
}

/**
 * Popular tags for filtering
 */
export const popularTags = [
  'bitcoin', 'lightning', 'nostr', 'javascript', 'react', 'api', 
  'security', 'frontend', 'backend', 'mobile', 'cryptography', 'web3',
  'nodejs', 'typescript', 'beginner', 'intermediate', 'advanced'
]

/**
 * Content type filters for UI
 * Icons are now resolved from configurable icons in config/content.json
 */
export const contentTypeFilters = [
  { type: 'course', icon: getContentTypeIcon('course'), label: 'Courses' },
  { type: 'video', icon: getContentTypeIcon('video'), label: 'Videos' },
  { type: 'document', icon: getContentTypeIcon('document'), label: 'Documents' }
] 