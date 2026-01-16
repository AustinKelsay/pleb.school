/**
 * Admin Hooks
 * 
 * React hooks for checking admin status and permissions in client components.
 * Provides both session-based (immediate) and server-based (async) admin checks.
 */

'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { 
  isAdminBySession, 
  isModeratorBySession, 
  type AdminInfo, 
  type AdminPermissions 
} from '@/lib/admin-utils'

/**
 * Hook for immediate admin status check using session data
 * This is fast but only checks config-based admin status (pubkey-based)
 */
export function useIsAdmin(): {
  isAdmin: boolean
  isModerator: boolean
  hasAdminOrModerator: boolean
  loading: boolean
} {
  const { data: session, status } = useSession()
  
  const isAdmin = isAdminBySession(session)
  const isModerator = isModeratorBySession(session)
  const hasAdminOrModerator = isAdmin || isModerator
  const loading = status === 'loading'

  return {
    isAdmin,
    isModerator,
    hasAdminOrModerator,
    loading
  }
}

/**
 * Hook for comprehensive admin info including database checks
 * This makes an API call to get complete admin information
 */
export function useAdminInfo(): {
  adminInfo: AdminInfo | null
  loading: boolean
  error: string | null
  refetch: () => void
} {
  const { data: session, status } = useSession()
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAdminInfo = useCallback(async () => {
    if (status === 'loading' || !session?.user) {
      setLoading(status === 'loading')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/admin/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch admin info')
      }

      const data = await response.json()
      setAdminInfo(data.adminInfo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Fallback to session-based check
      setAdminInfo({
        isAdmin: isAdminBySession(session),
        isModerator: isModeratorBySession(session),
        level: isAdminBySession(session) ? 'admin' : isModeratorBySession(session) ? 'moderator' : 'none',
        permissions: {} as AdminPermissions, // Empty permissions as fallback
        source: 'none'
      })
    } finally {
      setLoading(false)
    }
  }, [session, status])

  useEffect(() => {
    fetchAdminInfo()
  }, [fetchAdminInfo])

  return {
    adminInfo,
    loading,
    error,
    refetch: fetchAdminInfo
  }
}

/**
 * Hook for checking specific permissions
 */
export function usePermission(permission: keyof AdminPermissions): {
  hasPermission: boolean
  loading: boolean
} {
  const { adminInfo, loading } = useAdminInfo()
  
  const hasPermission = adminInfo?.permissions[permission] || false

  return {
    hasPermission,
    loading
  }
}

/**
 * Hook for checking if user can view their own content analytics
 */
export function useCanViewOwnAnalytics() {
  return usePermission('viewOwnAnalytics')
}

/**
 * Hook for checking if user can view platform-wide analytics
 */
export function useCanViewPlatformAnalytics() {
  return usePermission('viewPlatformAnalytics')
}

/**
 * Hook for checking if user can create courses
 */
export function useCanCreateCourse() {
  return usePermission('createCourse')
}

/**
 * Hook for checking if user can manage users
 */
export function useCanManageUsers() {
  return usePermission('manageUsers')
}

/**
 * Hook for checking if user can moderate content
 */
export function useCanModerateContent() {
  return usePermission('moderateContent')
}