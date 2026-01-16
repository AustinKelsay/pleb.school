/**
 * Admin Utilities
 * 
 * Provides functions for checking admin status and permissions across the application.
 * Supports both database-based admin roles and config-based admin pubkeys.
 * 
 * Admin Detection Methods:
 * 1. Database Role: Check the Role.admin field in the database
 * 2. Config Pubkeys: Check if user's pubkey is in admin.json config file
 * 3. Session Role: Check role information in the user session
 * 
 * This dual approach ensures admin detection works both with traditional database roles
 * and with Nostr-based admin management via public keys.
 */

import { Session } from 'next-auth'
import { prisma } from './prisma'
import adminConfig from '../../config/admin.json'
import { decodePublicKey, encodePublicKey } from 'snstr'

/**
 * Permission flags for admin users
 *
 * Analytics permissions are split for granular access control:
 * - viewOwnAnalytics: User can view analytics for their own content
 * - viewPlatformAnalytics: Admin can view all platform-wide analytics
 */
export interface AdminPermissions {
  createCourse: boolean
  editAnyCourse: boolean
  editOwnCourse: boolean
  deleteCourse: boolean
  createResource: boolean
  editAnyResource: boolean
  editOwnResource: boolean
  deleteResource: boolean
  manageUsers: boolean
  viewOwnAnalytics: boolean      // View analytics for own content
  viewPlatformAnalytics: boolean // View all platform analytics (admin only)
  moderateContent: boolean
  manageNostrEvents: boolean
}

/**
 * Admin level types
 */
export type AdminLevel = 'none' | 'moderator' | 'admin'

/**
 * Admin user information
 */
export interface AdminInfo {
  isAdmin: boolean
  isModerator: boolean
  level: AdminLevel
  permissions: AdminPermissions
  source: 'database' | 'config' | 'none'
}

/**
 * Convert between npub and hex formats
 * Returns both formats for comparison
 */
function normalizePublicKey(pubkey: string): { hex: string; npub: string } {
  try {
    if (pubkey.startsWith('npub1')) {
      // Convert npub to hex using snstr
      const hex = decodePublicKey(pubkey as `npub1${string}`)
      return { hex, npub: pubkey }
    } else if (/^[a-f0-9]{64}$/i.test(pubkey)) {
      // Convert hex to npub using snstr
      const npub = encodePublicKey(pubkey)
      return { hex: pubkey, npub }
    }
  } catch (error) {
    console.error('Error normalizing public key:', error)
  }
  
  // Fallback: return as-is for both formats
  return { hex: pubkey, npub: pubkey }
}

/**
 * Check if a pubkey is in the admin config
 * Compares both hex and npub formats to ensure compatibility
 */
function isAdminByConfig(pubkey: string | null | undefined): { isAdmin: boolean; isModerator: boolean } {
  if (!pubkey) return { isAdmin: false, isModerator: false }
  
  const normalized = normalizePublicKey(pubkey)
  
  // Check admin pubkeys (compare both formats)
  const isAdmin = adminConfig.admins.pubkeys.some(adminKey => 
    adminKey === normalized.hex || adminKey === normalized.npub
  )
  
  // Check moderator pubkeys (compare both formats)
  const isModerator = adminConfig.moderators.pubkeys.some(modKey => 
    modKey === normalized.hex || modKey === normalized.npub
  )
  
  return { isAdmin, isModerator }
}

/**
 * Get permissions for admin level
 */
function getPermissions(level: AdminLevel): AdminPermissions {
  switch (level) {
    case 'admin':
      return adminConfig.admins.permissions as AdminPermissions
    case 'moderator':
      return adminConfig.moderators.permissions as AdminPermissions
    default:
      return {
        createCourse: false,
        editAnyCourse: false,
        editOwnCourse: false,
        deleteCourse: false,
        createResource: false,
        editAnyResource: false,
        editOwnResource: false,
        deleteResource: false,
        manageUsers: false,
        viewOwnAnalytics: false,
        viewPlatformAnalytics: false,
        moderateContent: false,
        manageNostrEvents: false
      }
  }
}

/**
 * Check admin status from database role
 */
export async function checkAdminByDatabase(userId: string): Promise<{ isAdmin: boolean; isModerator: boolean }> {
  try {
    const userRole = await prisma.role.findUnique({
      where: { userId },
      select: { admin: true }
    })
    
    const isAdmin = userRole?.admin || false
    // Database doesn't distinguish moderators, so if they're not admin, they're not moderator
    return { isAdmin, isModerator: false }
  } catch (error) {
    console.error('Error checking admin status from database:', error)
    return { isAdmin: false, isModerator: false }
  }
}

/**
 * Get comprehensive admin information for a user
 */
export async function getAdminInfo(session: Session | null): Promise<AdminInfo> {
  if (!session?.user?.id) {
    return {
      isAdmin: false,
      isModerator: false,
      level: 'none',
      permissions: getPermissions('none'),
      source: 'none'
    }
  }

  // Method 1: Check by database role
  const dbCheck = await checkAdminByDatabase(session.user.id)
  if (dbCheck.isAdmin) {
    return {
      isAdmin: true,
      isModerator: false,
      level: 'admin',
      permissions: getPermissions('admin'),
      source: 'database'
    }
  }

  // Method 2: Check by config pubkeys
  const configCheck = isAdminByConfig(session.user.pubkey)
  if (configCheck.isAdmin) {
    return {
      isAdmin: true,
      isModerator: false,
      level: 'admin',
      permissions: getPermissions('admin'),
      source: 'config'
    }
  }
  
  if (configCheck.isModerator) {
    return {
      isAdmin: false,
      isModerator: true,
      level: 'moderator',
      permissions: getPermissions('moderator'),
      source: 'config'
    }
  }

  // Not an admin or moderator
  return {
    isAdmin: false,
    isModerator: false,
    level: 'none',
    permissions: getPermissions('none'),
    source: 'none'
  }
}

/**
 * Quick admin check - returns just boolean
 * Combines both database and config checks
 */
export async function isAdmin(session: Session | null): Promise<boolean> {
  const adminInfo = await getAdminInfo(session)
  return adminInfo.isAdmin
}

/**
 * Quick moderator check - returns just boolean
 */
export async function isModerator(session: Session | null): Promise<boolean> {
  const adminInfo = await getAdminInfo(session)
  return adminInfo.isModerator
}

/**
 * Check if user has admin or moderator privileges
 */
export async function hasModeratorOrAdmin(session: Session | null): Promise<boolean> {
  const adminInfo = await getAdminInfo(session)
  return adminInfo.isAdmin || adminInfo.isModerator
}

/**
 * Check specific permission
 */
export async function hasPermission(
  session: Session | null, 
  permission: keyof AdminPermissions
): Promise<boolean> {
  const adminInfo = await getAdminInfo(session)
  return adminInfo.permissions[permission]
}

/**
 * Client-side admin check (for components that have session)
 * This is a simpler version that works with session data only
 */
export function isAdminBySession(session: Session | null): boolean {
  if (!session?.user) return false
  
  // Check config-based admin status using pubkey
  const configCheck = isAdminByConfig(session.user.pubkey)
  return configCheck.isAdmin
}

/**
 * Client-side moderator check
 */
export function isModeratorBySession(session: Session | null): boolean {
  if (!session?.user) return false
  
  const configCheck = isAdminByConfig(session.user.pubkey)
  return configCheck.isModerator
}

/**
 * Get admin config for reference
 */
export function getAdminConfig() {
  return adminConfig
}

/**
 * Export admin config for use in other parts of the app
 */
export { adminConfig }