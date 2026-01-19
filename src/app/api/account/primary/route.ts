/**
 * Primary Provider Management API Endpoint
 * 
 * Allows authenticated users to change their primary authentication provider,
 * which determines which profile source is authoritative.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { changePrimaryProvider } from '@/lib/account-linking'
import { auditLog } from '@/lib/audit-logger'
import { z } from 'zod'

const ChangePrimarySchema = z.object({
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
    const validation = ChangePrimarySchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      )
    }

    const { provider } = validation.data

    // Change the primary provider
    const result = await changePrimaryProvider(session.user.id, provider)

    // Audit log primary provider change
    auditLog(session.user.id, 'account.primary.change', {
      provider,
      success: result.success,
      error: result.error
    }, request)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to change primary provider' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully changed primary provider to ${provider}`
    })
  } catch (error) {
    console.error('Change primary provider error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}