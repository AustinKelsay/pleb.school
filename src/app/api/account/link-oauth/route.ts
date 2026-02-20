/**
 * OAuth Account Linking Initiation Endpoint
 *
 * Initiates OAuth flow for linking additional accounts (GitHub, etc.)
 * This endpoint generates the OAuth URL with proper state for account linking.
 *
 * Security:
 * - Uses POST to prevent CSRF via img tags/prefetch
 * - State parameter is cryptographically signed to prevent CSRF attacks
 *
 * See: llm/implementation/ACCOUNT_LINKING_IMPLEMENTATION.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createSignedState } from '@/lib/oauth-state'
import { auditLog } from '@/lib/audit-logger'
import { z } from 'zod'

const LinkOAuthSchema = z.object({
  provider: z.enum(['github'])
})

// Changed from GET to POST to prevent CSRF attacks via img tags, prefetch, etc.
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const validation = LinkOAuthSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid provider', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { provider } = validation.data

    // For GitHub OAuth
    if (provider === 'github') {
      // Use separate GitHub OAuth app for linking if configured, otherwise use main app
      const clientId = process.env.GITHUB_LINK_CLIENT_ID || process.env.GITHUB_CLIENT_ID
      if (!clientId) {
        return NextResponse.json(
          { error: 'GitHub OAuth not configured' },
          { status: 500 }
        )
      }

      // Create cryptographically signed state with user ID and linking flag
      // This prevents CSRF attacks where an attacker could craft a state
      // with a victim's userId and link their own OAuth account to victim's profile
      const state = createSignedState({
        userId: session.user.id,
        action: 'link',
        provider: 'github'
      })

      // Audit log OAuth link initiation
      await auditLog(session.user.id, 'account.link.initiate', {
        provider: 'github'
      }, request)

      // Build GitHub OAuth URL with our custom callback for account linking
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/account/oauth-callback`,
        scope: 'user:email',
        state: state
      })

      const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`

      // Return URL instead of redirecting, let client handle navigation
      return NextResponse.json({ url: githubAuthUrl })
    }

    return NextResponse.json(
      { error: 'Provider not implemented' },
      { status: 400 }
    )
  } catch (error) {
    console.error('OAuth linking initiation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
