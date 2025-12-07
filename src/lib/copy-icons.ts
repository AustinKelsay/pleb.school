/**
 * Copy Icons Configuration
 *
 * Provides access to configurable UI icons from copy.json
 * Covers navigation, homepage, about, profile, status, actions, error, subscribe, and feeds icons
 */

import copyConfig from "../../config/copy.json"
import { getIcon, type LucideIcon } from "@/lib/icons-config"

// ============================================================================
// Type Definitions
// ============================================================================

interface CopyIconsConfig {
  navigation: Record<string, string>
  homepage: Record<string, string>
  about: Record<string, string>
  profile: Record<string, string>
  status: Record<string, string>
  actions: Record<string, string>
  error: Record<string, string>
  subscribe: Record<string, string>
  feeds: Record<string, string>
}

// ============================================================================
// Config Access
// ============================================================================

/**
 * Get the full icons configuration from copy.json
 */
export function getCopyIconsConfig(): CopyIconsConfig {
  return (copyConfig as { icons: CopyIconsConfig }).icons
}

// ============================================================================
// Navigation Icons
// ============================================================================

/**
 * Get a navigation icon
 * @param key - Navigation icon key (menu, search, settings, profile, logout, home, back, forward, brand, create)
 */
export function getNavigationIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.navigation[key] || "HelpCircle"
  return getIcon(iconName, "HelpCircle")
}

/**
 * Get all navigation icons as a record
 */
export function getAllNavigationIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.navigation)) {
    result[key] = getIcon(iconName, "HelpCircle")
  }
  return result
}

// ============================================================================
// Homepage Icons
// ============================================================================

/**
 * Get a homepage icon
 * @param key - Homepage icon key (badge, startLearning, watchDemo, ctaPrimary, ctaSecondary, visualPrimary, visualSecondary, visualCenter)
 */
export function getHomepageIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.homepage[key] || "Sparkles"
  return getIcon(iconName, "Sparkles")
}

/**
 * Get all homepage icons as a record
 */
export function getAllHomepageIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.homepage)) {
    result[key] = getIcon(iconName, "Sparkles")
  }
  return result
}

// ============================================================================
// About Page Icons
// ============================================================================

/**
 * Get an about page icon
 * @param key - About icon key (creators, platform, learners)
 */
export function getAboutIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.about[key] || "Info"
  return getIcon(iconName, "Info")
}

/**
 * Get all about page icons as a record
 */
export function getAllAboutIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.about)) {
    result[key] = getIcon(iconName, "Info")
  }
  return result
}

// ============================================================================
// Profile Page Icons
// ============================================================================

/**
 * Get a profile page icon
 * @param key - Profile icon key (user, activity, settings, accounts, content, analytics)
 */
export function getProfileIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.profile[key] || "User"
  return getIcon(iconName, "User")
}

/**
 * Get all profile page icons as a record
 */
export function getAllProfileIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.profile)) {
    result[key] = getIcon(iconName, "User")
  }
  return result
}

// ============================================================================
// Status Icons
// ============================================================================

/**
 * Get a status icon
 * @param key - Status icon key (draft, edit, preview, share, publish)
 */
export function getStatusIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.status[key] || "Info"
  return getIcon(iconName, "Info")
}

/**
 * Get all status icons as a record
 */
export function getAllStatusIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.status)) {
    result[key] = getIcon(iconName, "Info")
  }
  return result
}

// ============================================================================
// Action Icons
// ============================================================================

/**
 * Get an action icon
 * @param key - Action icon key (copy, download, externalLink, info)
 */
export function getActionIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.actions[key] || "MoreHorizontal"
  return getIcon(iconName, "MoreHorizontal")
}

/**
 * Get all action icons as a record
 */
export function getAllActionIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.actions)) {
    result[key] = getIcon(iconName, "MoreHorizontal")
  }
  return result
}

// ============================================================================
// Error Page Icons
// ============================================================================

/**
 * Get an error page icon
 * @param key - Error icon key (notFound, serverError, refresh)
 */
export function getErrorIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.error[key] || "AlertCircle"
  return getIcon(iconName, "AlertCircle")
}

/**
 * Get all error page icons as a record
 */
export function getAllErrorIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.error)) {
    result[key] = getIcon(iconName, "AlertCircle")
  }
  return result
}

// ============================================================================
// Subscribe Page Icons
// ============================================================================

/**
 * Get a subscribe page icon
 * @param key - Subscribe icon key (badge, signal, creators, perks)
 */
export function getSubscribeIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.subscribe[key] || "Sparkles"
  return getIcon(iconName, "Sparkles")
}

/**
 * Get all subscribe page icons as a record
 */
export function getAllSubscribeIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.subscribe)) {
    result[key] = getIcon(iconName, "Sparkles")
  }
  return result
}

// ============================================================================
// Feeds Page Icons
// ============================================================================

/**
 * Get a feeds page icon
 * @param key - Feeds icon key (sources, alerts, adaptive)
 */
export function getFeedsIcon(key: string): LucideIcon {
  const icons = getCopyIconsConfig()
  const iconName = icons.feeds[key] || "Rss"
  return getIcon(iconName, "Rss")
}

/**
 * Get all feeds page icons as a record
 */
export function getAllFeedsIcons(): Record<string, LucideIcon> {
  const icons = getCopyIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.feeds)) {
    result[key] = getIcon(iconName, "Rss")
  }
  return result
}
