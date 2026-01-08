/**
 * POST Email Verification for Account Linking (Secure Flow)
 *
 * Verifies a short code (token) against a lookup reference (ref) and links the
 * email address embedded in the verification token identifier to the user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { linkAccount } from '@/lib/account-linking'
import { sanitizeEmail } from '@/lib/api-utils'
import { z } from 'zod'

const VerifySchema = z.object({
  ref: z.string().min(4).max(64),
  token: z.string().min(4).max(64)
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
    }

    const { ref, token } = parsed.data

    // Find verification token by lookupId (ref)
    const verificationToken = await prisma.verificationToken.findFirst({
      where: { lookupId: ref }
    })

    if (!verificationToken) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    // Check expiration
    if (verificationToken.expires < new Date()) {
      try {
        await prisma.verificationToken.delete({ where: { token: verificationToken.token } })
      } catch (error) {
        console.error('Failed to delete expired verification token:', error)
      }
      return NextResponse.json({ error: 'token_expired' }, { status: 400 })
    }

    // Identifier format: link:<userId>:<email>
    const parts = verificationToken.identifier.split(':')
    if (parts.length !== 3 || parts[0] !== 'link') {
      try {
        await prisma.verificationToken.delete({ where: { token: verificationToken.token } })
      } catch (error) {
        console.error('Failed to delete invalid verification token:', error)
      }
      return NextResponse.json({ error: 'invalid_token_format' }, { status: 400 })
    }

    const [, userId, emailRaw] = parts
    const normalizedEmail = sanitizeEmail(emailRaw)

    // Ensure provided token matches the stored token (short code)
    if (verificationToken.token !== token) {
      return NextResponse.json({ error: 'token_mismatch' }, { status: 400 })
    }

    // Link the email account to the user
    const result = await linkAccount(
      userId,
      'email',
      normalizedEmail,
      {}
    )

    // Cleanup token regardless of success
    try {
      await prisma.verificationToken.delete({ where: { token: verificationToken.token } })
    } catch (error) {
      console.error('Failed to delete verification token after linking:', error)
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'linking_failed' }, { status: 400 })
    }

    // Backfill user.email if missing
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user && !user.email) {
      await prisma.user.update({
        where: { id: userId },
        data: { email: normalizedEmail, emailVerified: new Date() }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Verify email (POST) error:', error)
    return NextResponse.json({ error: 'verification_error' }, { status: 500 })
  }
}

