/**
 * Admin Badge Component
 * 
 * Example client component that demonstrates how to use the admin detection hooks.
 * Shows an admin or moderator badge next to content when appropriate.
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Shield, ShieldCheck, Crown } from 'lucide-react'
import { useIsAdmin } from '@/hooks/useAdmin'

interface AdminBadgeProps {
  userId?: string
  className?: string
  showIcons?: boolean
}

export function AdminBadge({ userId, className = '', showIcons = true }: AdminBadgeProps) {
  const { isAdmin, isModerator, hasAdminOrModerator, loading } = useIsAdmin()

  // Don't show anything while loading or if user has no admin privileges
  if (loading || !hasAdminOrModerator) {
    return null
  }

  if (isAdmin) {
    return (
      <Badge variant="default" className={`bg-red-500 hover:bg-red-600 text-white ${className}`}>
        {showIcons && <Crown className="w-3 h-3 mr-1" />}
        Admin
      </Badge>
    )
  }

  if (isModerator) {
    return (
      <Badge variant="secondary" className={`bg-blue-500 hover:bg-blue-600 text-white ${className}`}>
        {showIcons && <ShieldCheck className="w-3 h-3 mr-1" />}
        Moderator
      </Badge>
    )
  }

  return null
}

/**
 * Admin Check Component
 * 
 * Renders children only if user has admin privileges.
 * Useful for conditionally showing admin-only UI elements.
 */
interface AdminOnlyProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  requireAdmin?: boolean // If true, only shows for full admins, not moderators
}

export function AdminOnly({ children, fallback = null, requireAdmin = false }: AdminOnlyProps) {
  const { isAdmin, isModerator, hasAdminOrModerator, loading } = useIsAdmin()

  if (loading) {
    return <>{fallback}</>
  }

  if (requireAdmin && !isAdmin) {
    return <>{fallback}</>
  }

  if (!requireAdmin && !hasAdminOrModerator) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Permission Check Component
 * 
 * Renders children only if user has the specified permission.
 */
interface PermissionCheckProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  permission: 'createCourse' | 'viewOwnAnalytics' | 'viewPlatformAnalytics' | 'manageUsers' | 'moderateContent'
}

export function PermissionCheck({ children, fallback = null, permission }: PermissionCheckProps) {
  // For simplicity, we'll use the basic admin check
  // In a real implementation, you'd use the usePermission hook
  const { isAdmin, isModerator, loading } = useIsAdmin()

  if (loading) {
    return <>{fallback}</>
  }

  // Simplified permission check - in real implementation you'd check specific permissions
  const hasPermission = isAdmin || (isModerator && ['moderateContent'].includes(permission))

  if (!hasPermission) {
    return <>{fallback}</>
  }

  return <>{children}</>
}