/**
 * Anonymous Reconnect Token Cookie API
 *
 * Stores the reconnect token in an httpOnly cookie instead of localStorage,
 * protecting it from XSS attacks. The token is only accessible server-side.
 *
 * POST: Set the reconnect token cookie (called after successful anonymous login)
 * DELETE: Clear the reconnect token cookie (called on logout or token invalidation)
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const COOKIE_NAME = 'anon-reconnect-token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year (same as token validity concept)

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
      secure: process.env.NODE_ENV === 'production',
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
    const cookieStore = await cookies()
    cookieStore.delete(COOKIE_NAME)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear reconnect cookie:', error)
    return NextResponse.json(
      { error: 'Failed to clear reconnect cookie' },
      { status: 500 }
    )
  }
}
