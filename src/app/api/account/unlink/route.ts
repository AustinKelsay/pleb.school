/**
 * Account Unlinking API Endpoint
 * 
 * Allows authenticated users to unlink authentication methods
 * from their account (except the last one).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unlinkAccount } from '@/lib/account-linking'
import { auditLog } from '@/lib/audit-logger'
import { z } from 'zod'

const UnlinkAccountSchema = z.object({
  provider: z.enum(['nostr', 'email', 'github', 'anonymous', 'recovery'])
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
    const validation = UnlinkAccountSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { provider } = validation.data

    // Unlink the account
    const result = await unlinkAccount(session.user.id, provider)

    // Audit log account unlinking
    await auditLog(session.user.id, 'account.unlink', {
      provider,
      success: result.success,
      error: result.error
    }, request)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to unlink account' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully unlinked ${provider} account`
    })
  } catch (error) {
    console.error('Account unlinking error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
