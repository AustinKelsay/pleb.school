/**
 * Send Email Verification for Account Linking
 *
 * Sends a verification email to link an email address to an existing account.
 * Rate limited to 3 emails per address per hour to prevent spam.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { sanitizeEmail } from '@/lib/api-utils'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import crypto from 'crypto'
import { createTransport } from 'nodemailer'
import { resolveEmailRuntimeConfig, SmtpSetupError } from '@/lib/email-config'

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

    // Get email from request body
    const body = await request.json()
    const { email } = body

    const normalizedEmail = sanitizeEmail(String(email || ''))

    // Rate limit by email address to prevent spam
    const rateLimit = await checkRateLimit(
      `send-verify:${normalizedEmail.toLowerCase()}`,
      RATE_LIMITS.EMAIL_SEND.limit,
      RATE_LIMITS.EMAIL_SEND.windowSeconds
    )

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many verification emails requested. Please try again later.',
          retryAfter: rateLimit.resetIn
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetIn) }
        }
      )
    }
    const isValidEmail = z.string().email().max(254).safeParse(normalizedEmail).success
    if (!isValidEmail) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    // Check if email is already linked to another account
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      if (existingUser.id === session.user.id) {
        return NextResponse.json(
          { error: 'This email is already linked to your account' },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: 'This email is already linked to another account' },
          { status: 400 }
        )
      }
    }

    // Check if user already has an email linked (if they're not using email provider)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accounts: true }
    })

    const hasEmailAccount = currentUser?.accounts.some(a => a.provider === 'email')
    if (hasEmailAccount) {
      return NextResponse.json(
        { error: 'You already have an email account linked' },
        { status: 400 }
      )
    }

    // Generate short code + lookup reference for secure POST verification
    const code = crypto.randomInt(100000, 1000000).toString() // 6-digit code (cryptographically secure)
    const lookupId = crypto.randomBytes(8).toString('hex')
    const expires = new Date(Date.now() + 3600000) // 1 hour from now

    // Resolve email runtime config first so SMTP misconfiguration fails before any DB writes.
    const emailRuntimeConfig = resolveEmailRuntimeConfig(process.env, {
      strict: true,
      context: 'Account linking verification email'
    })
    const transporter = createTransport(emailRuntimeConfig.server)

    // Store verification record: identifier carries context; token holds short code; lookupId is used in URL
    await prisma.verificationToken.create({
      data: {
        identifier: `link:${session.user.id}:${normalizedEmail}`,
        token: code,
        lookupId,
        expires
      }
    })

    const verificationUrl = `${process.env.NEXTAUTH_URL}/verify-email?ref=${lookupId}`

    await transporter.sendMail({
      from: emailRuntimeConfig.from,
      to: normalizedEmail,
      subject: 'Verify your email to link your account',
      html: `
        <div>
          <h2>Verify your email address</h2>
          <p>Use the verification code below on the page we open for you.</p>
          <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">${code}</p>
          <p>Open this secure page to enter your code:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This code expires in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `
        Verify your email address

        Your verification code: ${code}
        Open this page to enter your code: ${verificationUrl}

        This code will expire in 1 hour.
        
        If you didn't request this, please ignore this email.
      `
    })

    return NextResponse.json({ 
      success: true,
      message: 'Verification email sent' 
    })
  } catch (error) {
    console.error('Send verification email error:', error)
    if (error instanceof SmtpSetupError) {
      return NextResponse.json(
        { error: 'Email service is not configured' },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    )
  }
}
