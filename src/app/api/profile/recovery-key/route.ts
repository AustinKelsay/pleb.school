/**
 * Recovery Key API Endpoint
 *
 * Allows authenticated users to retrieve their ephemeral private key
 * for account recovery and backup purposes.
 *
 * Security:
 * - Rate limited to prevent abuse
 * - Cache-Control: no-store to prevent caching
 * - Only called when user explicitly requests to view/copy their key
 * - Key is never exposed in session/JWT
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptPrivkey } from '@/lib/privkey-crypto'
import { checkRateLimit } from '@/lib/rate-limit'

// Rate limit: 10 requests per 15 minutes per user
const RATE_LIMIT = { limit: 10, windowSeconds: 900 }

// Security headers for sensitive key material
const securityHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0'
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: securityHeaders }
      )
    }

    // Rate limit by user ID
    const rateLimitResult = await checkRateLimit(
      `recovery-key:${session.user.id}`,
      RATE_LIMIT.limit,
      RATE_LIMIT.windowSeconds
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            ...securityHeaders,
            'Retry-After': String(rateLimitResult.resetIn)
          }
        }
      )
    }

    // Fetch the encrypted privkey from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { privkey: true }
    })

    if (!user?.privkey) {
      // NIP-07 users don't have stored keys - this is expected
      return NextResponse.json(
        { error: 'No recovery key available. NIP-07 users manage their own keys.' },
        { status: 404, headers: securityHeaders }
      )
    }

    // Decrypt and return the key
    const decryptedKey = decryptPrivkey(user.privkey)

    if (!decryptedKey) {
      return NextResponse.json(
        { error: 'Recovery key unavailable. The stored key could not be decrypted. This can happen if the server encryption key changed.' },
        { status: 404, headers: securityHeaders }
      )
    }

    return NextResponse.json(
      { recoveryKey: decryptedKey },
      { headers: securityHeaders }
    )
  } catch (error) {
    console.error('Failed to fetch recovery key:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recovery key' },
      { status: 500, headers: securityHeaders }
    )
  }
}
