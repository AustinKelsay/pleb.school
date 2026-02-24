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

const COOKIE_NAME = 'anon-reconnect-token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year (same as token validity concept)
const env = getEnv()

/**
 * POST: Store the reconnect token from the current session into an httpOnly cookie
 *
 * The token is retrieved from the authenticated session, not from the request body,
 * ensuring only legitimately authenticated users can set their own token.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    // Must be an authenticated anonymous user with a reconnect token
    if (!session?.user?.reconnectToken) {
      return NextResponse.json(
        { error: 'No reconnect token available' },
        { status: 400 }
      )
    }

    // Only allow for anonymous provider sessions
    if (session.provider !== 'anonymous') {
      return NextResponse.json(
        { error: 'Only anonymous sessions use reconnect tokens' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()

    // Set httpOnly cookie - cannot be accessed by JavaScript
    cookieStore.set(COOKIE_NAME, session.user.reconnectToken, {
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
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const cookieStore = await cookies()
    // Clear cookie using same attributes as when setting to ensure proper removal
    cookieStore.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear reconnect cookie:', error)
    return NextResponse.json(
      { error: 'Failed to clear reconnect cookie' },
      { status: 500 }
    )
  }
}
