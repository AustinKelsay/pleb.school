/**
 * Icon Configuration System
 *
 * Central utility for resolving and validating lucide-react icons from config files.
 * Icons are stored as string names in config and resolved to LucideIcon components at runtime.
 *
 * @see https://lucide.dev/icons/ for available icon names
 */

import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Default fallback icon when configured icon is invalid
const FALLBACK_ICON_NAME = 'HelpCircle'

/**
 * Cache for resolved icons to avoid repeated lookups
 */
const iconCache = new Map<string, LucideIcon | null>()

/**
 * Get a lucide-react icon component by name
 *
 * @param iconName - PascalCase icon name (e.g., "BookOpen", "Zap", "ArrowLeft")
 * @param fallback - Optional fallback icon name if primary is invalid
 * @returns The LucideIcon component
 *
 * @example
 * const Icon = getIcon('BookOpen')
 * return <Icon className="h-4 w-4" />
 */
export function getIcon(iconName: string, fallback?: string): LucideIcon {
  const icon = getIconOrNull(iconName)
  if (icon) return icon

  // Try fallback if provided
  if (fallback) {
    const fallbackIcon = getIconOrNull(fallback)
    if (fallbackIcon) return fallbackIcon
  }

  // Use default fallback
  const defaultFallback = getIconOrNull(FALLBACK_ICON_NAME)
  if (defaultFallback) return defaultFallback

  // Last resort - return a basic icon (should never happen)
  return LucideIcons.HelpCircle
}

/**
 * Get a lucide-react icon component by name, or null if not found
 *
 * @param iconName - PascalCase icon name
 * @returns The LucideIcon component or null if not found
 */
export function getIconOrNull(iconName: string): LucideIcon | null {
  if (!iconName) return null

  // Check cache first
  if (iconCache.has(iconName)) {
    return iconCache.get(iconName) || null
  }

  // Look up icon in lucide-react exports
  const maybeIcon = (LucideIcons as Record<string, unknown>)[iconName]

  const isLucideComponent =
    typeof maybeIcon === "function" ||
    (typeof maybeIcon === "object" &&
      maybeIcon !== null &&
      "$$typeof" in (maybeIcon as Record<string, unknown>))

  if (isLucideComponent) {
    const icon = maybeIcon as LucideIcon
    iconCache.set(iconName, icon)
    return icon
  }

  // Icon not found - log warning in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[icons-config] Invalid icon name: "${iconName}". See https://lucide.dev/icons/ for available icons.`)
  }

  iconCache.set(iconName, null)
  return null
}

/**
 * Validate that an icon name exists in lucide-react
 *
 * @param iconName - PascalCase icon name to validate
 * @returns true if icon exists, false otherwise
 */
export function validateIconName(iconName: string): boolean {
  if (!iconName) return false
  return getIconOrNull(iconName) !== null
}

/**
 * Validate multiple icon names and return any invalid ones
 *
 * @param iconNames - Array of icon names to validate
 * @returns Array of invalid icon names (empty if all valid)
 */
export function validateIconNames(iconNames: string[]): string[] {
  return iconNames.filter(name => !validateIconName(name))
}

/**
 * Get all available lucide-react icon names
 * Useful for documentation and validation
 *
 * @returns Array of all available icon names
 */
export function getAvailableIconNames(): string[] {
  return Object.keys(LucideIcons).filter(key => {
    const value = (LucideIcons as Record<string, unknown>)[key]
    // Filter to only icon components (lucide icons are forwardRef objects in React 19)
    const isIcon =
      typeof value === "function" ||
      (typeof value === "object" && value !== null && "$$typeof" in (value as Record<string, unknown>))
    return isIcon && /^[A-Z]/.test(key)
  })
}

/**
 * Get icon configuration validation errors for a config object
 *
 * @param iconConfig - Object with icon name values to validate
 * @param configPath - Path for error messages (e.g., "content.icons.contentTypes")
 * @returns Array of error messages
 */
export function getIconConfigErrors(
  iconConfig: Record<string, string | Record<string, string>>,
  configPath: string
): string[] {
  const errors: string[] = []

  for (const [key, value] of Object.entries(iconConfig)) {
    if (typeof value === 'string') {
      if (!validateIconName(value)) {
        errors.push(`Invalid icon "${value}" at ${configPath}.${key}`)
      }
    } else if (typeof value === 'object') {
      // Nested object - recurse
      errors.push(...getIconConfigErrors(value, `${configPath}.${key}`))
    }
  }

  return errors
}

/**
 * Create an icon getter function for a specific config section
 *
 * @param iconConfig - The icon configuration object
 * @param fallbackIcon - Default fallback icon name
 * @returns A function that gets icons by key
 */
export function createIconGetter(
  iconConfig: Record<string, string>,
  fallbackIcon: string = FALLBACK_ICON_NAME
): (key: string) => LucideIcon {
  return (key: string): LucideIcon => {
    const iconName = iconConfig[key]
    return getIcon(iconName || fallbackIcon, fallbackIcon)
  }
}

// Re-export LucideIcon type for convenience
export type { LucideIcon }
