/**
 * OAuth Account Linking Callback Endpoint
 *
 * Handles OAuth callbacks for account linking (GitHub, etc.)
 * Processes the OAuth response and links the account.
 *
 * Security: State parameter is cryptographically verified to prevent CSRF attacks.
 * States are signed with HMAC-SHA256 and expire after 10 minutes.
 * See src/lib/oauth-state.ts for implementation details.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { linkAccount } from '@/lib/account-linking'
import { verifySignedState } from '@/lib/oauth-state'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=${encodeURIComponent(error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=missing_params`
      )
    }

    // Verify cryptographic signature, expiry, and decode state
    // This prevents CSRF attacks where an attacker crafts a state with victim's userId
    const stateResult = verifySignedState(state)
    if (!stateResult.valid) {
      console.warn('OAuth state verification failed:', stateResult.error)
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=invalid_state`
      )
    }

    const stateData = stateResult.data

    // Verify the action is for linking (should always be true after schema validation)
    if (stateData.action !== 'link') {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=invalid_action`
      )
    }

    // Check if user is still logged in and matches the state
    // This is a secondary check - the signature already proves the state was created
    // by our server for this specific user, but we verify they're still logged in
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.id !== stateData.userId) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=session_mismatch`
      )
    }

    // Exchange code for access token (GitHub)
    if (stateData.provider === 'github') {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Use separate GitHub OAuth app for linking if configured
          client_id: process.env.GITHUB_LINK_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_LINK_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
          code: code,
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/account/oauth-callback`
        })
      })

      // Verify response status and Content-Type before parsing JSON
      if (!tokenResponse.ok) {
        console.error('OAuth token exchange failed:', { status: tokenResponse.status })
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=token_exchange_failed`
        )
      }

      const tokenContentType = tokenResponse.headers.get('content-type') || ''
      if (!tokenContentType.includes('application/json')) {
        console.error('OAuth token response has unexpected Content-Type:', { contentType: tokenContentType })
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=token_exchange_failed`
        )
      }

      const tokenData = await tokenResponse.json()

      if (!tokenData.access_token) {
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=token_exchange_failed`
        )
      }

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json'
        }
      })

      // Verify response status and Content-Type before parsing JSON
      if (!userResponse.ok) {
        console.error('GitHub user fetch failed:', { status: userResponse.status })
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=user_fetch_failed`
        )
      }

      const userContentType = userResponse.headers.get('content-type') || ''
      if (!userContentType.includes('application/json')) {
        console.error('GitHub user response has unexpected Content-Type:', { contentType: userContentType })
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=user_fetch_failed`
        )
      }

      const githubUser = await userResponse.json()

      if (!githubUser.id) {
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=user_fetch_failed`
        )
      }

      // Link the GitHub account
      const result = await linkAccount(
        session.user.id,
        'github',
        githubUser.id.toString(),
        {
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          scope: tokenData.scope
        }
      )

      if (result.success) {
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&success=github_linked`
        )
      } else {
        return NextResponse.redirect(
          `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=${encodeURIComponent(result.error || 'linking_failed')}`
        )
      }
    }

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=unknown_provider`
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/profile?tab=accounts&error=internal_error`
    )
  }
}