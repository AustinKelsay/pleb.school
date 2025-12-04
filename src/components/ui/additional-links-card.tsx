/**
 * Additional Links Card Component
 *
 * A reusable component for displaying additional resource links in card or inline format.
 * Provides consistent styling and spacing across the application.
 */

import { BookOpen, ExternalLink, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { additionalLinkLabel, additionalLinkHostname } from "@/lib/additional-links"
import type { AdditionalLink } from "@/types/additional-links"

interface AdditionalLinksCardProps {
  /** Array of links to display */
  links: AdditionalLink[]
  /** Card title (default: "Additional Resources") */
  title?: string
  /** Icon variant to use */
  icon?: "book" | "link" | "file"
  /** Layout variant - grid uses 2 columns on md+, stack is single column */
  layout?: "grid" | "stack"
  /** Custom className for the container */
  className?: string
}

/**
 * Renders a card containing a list of additional resource links.
 * Used throughout the app to display supplementary materials like external URLs,
 * documentation, and related resources.
 */
export function AdditionalLinksCard({
  links,
  title = "Additional Resources",
  icon = "book",
  layout = "grid",
  className = ""
}: AdditionalLinksCardProps) {
  if (!links || links.length === 0) return null

  const IconComponent = icon === "book" ? BookOpen : icon === "file" ? FileText : ExternalLink

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <IconComponent className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={layout === "grid" 
          ? "grid grid-cols-1 md:grid-cols-2 gap-4"
          : "flex flex-col gap-3"
        }>
          {links.map((link, index) => (
            <AdditionalLinkItem key={link.url + index} link={link} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface AdditionalLinksListProps {
  /** Array of links to display */
  links: AdditionalLink[]
  /** Section title */
  title?: string
  /** Custom className for the container */
  className?: string
}

/**
 * Renders a simple list of additional links without the card wrapper.
 * Used in hero sections and sidebars where a full card is not needed.
 */
export function AdditionalLinksList({
  links,
  title = "Additional Resources",
  className = ""
}: AdditionalLinksListProps) {
  if (!links || links.length === 0) return null

  return (
    <div className={`space-y-3 ${className}`}>
      <h4 className="font-semibold text-sm">{title}</h4>
      <div className="flex flex-col gap-2">
        {links.map((link, index) => (
          <AdditionalLinkItem key={link.url + index} link={link} compact />
        ))}
      </div>
    </div>
  )
}

interface AdditionalLinkItemProps {
  link: AdditionalLink
  /** Compact mode for inline lists (smaller icon, tighter spacing) */
  compact?: boolean
}

/**
 * Individual link item with icon, label, and hostname.
 * Renders as a clickable card-like element with hover states.
 */
function AdditionalLinkItem({ link, compact = false }: AdditionalLinkItemProps) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        group flex items-start gap-3 rounded-lg border border-border bg-card
        transition-all duration-200 hover:border-primary/50 hover:bg-accent/50
        ${compact ? "p-3" : "p-4"}
      `}
    >
      <div className={`
        flex-shrink-0 rounded-md bg-muted p-2
        transition-colors group-hover:bg-primary/10
        ${compact ? "mt-0" : "mt-0.5"}
      `}>
        <ExternalLink className={`text-muted-foreground group-hover:text-primary ${compact ? "h-4 w-4" : "h-5 w-5"}`} />
      </div>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className={`
          font-medium leading-tight text-foreground group-hover:text-primary
          transition-colors truncate
          ${compact ? "text-sm" : "text-base"}
        `}>
          {additionalLinkLabel(link)}
        </span>
        <span className={`
          text-muted-foreground truncate
          ${compact ? "text-xs" : "text-sm"}
        `}>
          {additionalLinkHostname(link)}
        </span>
      </div>
    </a>
  )
}

