/**
 * Account Linking API Endpoint
 * 
 * Allows authenticated users to link additional authentication methods
 * to their existing account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { linkAccount, canLinkAccount } from '@/lib/account-linking'
import { z } from 'zod'

const LinkAccountSchema = z.object({
  provider: z.enum(['nostr', 'email', 'github', 'anonymous']),
  providerAccountId: z.string(),
  accountData: z.object({
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    expires_at: z.number().optional(),
    token_type: z.string().optional(),
    scope: z.string().optional(),
  }).optional()
})

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
    const body = await request.json()
    const validation = LinkAccountSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { provider, providerAccountId, accountData } = validation.data

    // Check if account can be linked (returns error string or null)
    const linkError = await canLinkAccount(session.user.id, provider, providerAccountId)
    if (linkError) {
      return NextResponse.json(
        { error: linkError },
        { status: 400 }
      )
    }

    // Link the account
    const result = await linkAccount(
      session.user.id,
      provider,
      providerAccountId,
      accountData
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to link account' },
        { status: 400 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: `Successfully linked ${provider} account` 
    })
  } catch (error) {
    console.error('Account linking error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}