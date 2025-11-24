import { 
  BookOpen, 
  Video, 
  FileText, 
  Map, 
  Shield,
  type LucideIcon
} from "lucide-react"

/**
 * Centralized UI configuration for consistent display across the application
 * Uses standard shadcn variants for colors to work with the configurable theme system
 */

/**
 * Icons mapping for different content types
 */
export const contentTypeIcons: Record<string, LucideIcon> = {
  course: BookOpen,
  video: Video,
  document: FileText,
  guide: Map,
  cheatsheet: Shield,
}

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
  guide: "Guide",
  cheatsheet: "Cheat Sheet",
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
 */
export const contentTypeFilters = [
  { type: 'course', icon: BookOpen, label: 'Courses' },
  { type: 'video', icon: Video, label: 'Videos' },
  { type: 'document', icon: FileText, label: 'Documents' }
] 