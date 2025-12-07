/**
 * Auth Icons Configuration
 *
 * Provides access to configurable authentication icons from auth.json
 * Covers provider icons, security icons, and account management icons
 */

import authConfig from "../../config/auth.json"
import { getIcon, type LucideIcon } from "@/lib/icons-config"

// ============================================================================
// Type Definitions
// ============================================================================

interface AuthIconsConfig {
  providers: Record<string, string>
  security: Record<string, string>
  account: Record<string, string>
}

// ============================================================================
// Config Access
// ============================================================================

/**
 * Get the full icons configuration from auth.json
 */
export function getAuthIconsConfig(): AuthIconsConfig {
  return (authConfig as { icons: AuthIconsConfig }).icons
}

// ============================================================================
// Provider Icons
// ============================================================================

/**
 * Get an authentication provider icon
 * @param provider - Provider key (email, github, nostr, anonymous, recovery)
 */
export function getProviderIcon(provider: string): LucideIcon {
  const icons = getAuthIconsConfig()
  const iconName = icons.providers[provider] || "User"
  return getIcon(iconName, "User")
}

/**
 * Get all provider icons as a record
 */
export function getAllProviderIcons(): Record<string, LucideIcon> {
  const icons = getAuthIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [provider, iconName] of Object.entries(icons.providers)) {
    result[provider] = getIcon(iconName, "User")
  }
  return result
}

// ============================================================================
// Security Icons
// ============================================================================

/**
 * Get a security-related icon
 * @param key - Security icon key (shield, shieldCheck, key, sparkles, help, arrow, chevronDown)
 */
export function getSecurityIcon(key: string): LucideIcon {
  const icons = getAuthIconsConfig()
  const iconName = icons.security[key] || "Shield"
  return getIcon(iconName, "Shield")
}

/**
 * Get all security icons as a record
 */
export function getAllSecurityIcons(): Record<string, LucideIcon> {
  const icons = getAuthIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.security)) {
    result[key] = getIcon(iconName, "Shield")
  }
  return result
}

// ============================================================================
// Account Management Icons
// ============================================================================

/**
 * Get an account management icon
 * @param key - Account icon key (link, unlink, user, admin, loader)
 */
export function getAccountIcon(key: string): LucideIcon {
  const icons = getAuthIconsConfig()
  const iconName = icons.account[key] || "User"
  return getIcon(iconName, "User")
}

/**
 * Get all account icons as a record
 */
export function getAllAccountIcons(): Record<string, LucideIcon> {
  const icons = getAuthIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.account)) {
    result[key] = getIcon(iconName, "User")
  }
  return result
}
