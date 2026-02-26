/**
 * Anonymous Reconnect Token Cookie API
 *
 * Stores the reconnect token in an httpOnly cookie, protecting it from XSS
 * attacks. The token is only accessible server-side.
 *
 * POST: Set the reconnect token cookie (called after successful anonymous login)
 * DELETE: Clear the reconnect token cookie (called on logout or token invalidation)
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEnv } from '@/lib/env'
import { generateReconnectToken } from '@/lib/anon-reconnect-token'
import { UserAdapter } from '@/lib/db-adapter'

const COOKIE_NAME = 'anon-reconnect-token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year (same as token validity concept)
const env = getEnv()

function clearReconnectCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/**
 * POST: Rotate reconnect token server-side and set an httpOnly cookie
 *
 * Token generation and hash persistence happen server-side to avoid exposing
 * reconnect credentials to client-visible session payloads.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    // Must be an authenticated anonymous user
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Only allow for anonymous provider sessions
    if (session.provider !== 'anonymous') {
      return NextResponse.json(
        { error: 'Only anonymous sessions use reconnect tokens' },
        { status: 400 }
      )
    }

    const { token, tokenHash } = generateReconnectToken()
    await UserAdapter.setAnonReconnectTokenHash(session.user.id, tokenHash)

    const cookieStore = await cookies()

    // Set httpOnly cookie - cannot be accessed by JavaScript
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set reconnect cookie:', error)
    return NextResponse.json(
      { error: 'Failed to set reconnect cookie' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Clear the reconnect token cookie
 *
 * Called when the user logs out or when a token is invalidated.
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      const response = NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
      clearReconnectCookie(response)
      return response
    }

    const response = NextResponse.json({ success: true })
    clearReconnectCookie(response)

    // Revoke server-side reconnect credential for the authenticated subject.
    try {
      await UserAdapter.setAnonReconnectTokenHash(session.user.id, null)
    } catch (error) {
      console.error('Failed to revoke reconnect token hash:', error)
      const errorResponse = NextResponse.json(
        { error: 'Failed to revoke reconnect token' },
        { status: 500 }
      )
      clearReconnectCookie(errorResponse)
      return errorResponse
    }

    return response
  } catch (error) {
    console.error('Failed to clear reconnect cookie:', error)
    const response = NextResponse.json(
      { error: 'Failed to clear reconnect cookie' },
      { status: 500 }
    )
    clearReconnectCookie(response)
    return response
  }
}
