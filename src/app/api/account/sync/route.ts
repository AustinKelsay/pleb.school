/**
 * Profile Sync API
 * Syncs profile data from a specific provider
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  fetchNostrProfile,
  validateUsername,
  validateImageUrl,
  validateNip05,
  validateLud16
} from '@/lib/nostr-profile'
import { sanitizeEmail } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

/**
 * Shape of allowed user profile updates coming from provider syncs.
 * Only includes fields we explicitly allow to be updated on `User`.
 */
type UpdateUserPayload = {
  username?: string
  avatar?: string
  banner?: string
  email?: string
  nip05?: string
  lud16?: string
}

/**
 * Refresh a GitHub OAuth access token using a refresh token.
 * Uses standard OAuth token endpoint and environment client credentials.
 */
async function refreshGithubAccessToken(refreshToken: string): Promise<
  | {
      access_token: string
      refresh_token?: string
      token_type?: string
      scope?: string
      expires_in?: number
    }
  | null
> {
  try {
    const clientId = process.env.GITHUB_LINK_CLIENT_ID || process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_LINK_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    })

    if (!res.ok) {
      console.warn('GitHub token refresh failed with status:', res.status)
      return null
    }

    const data = await res.json()
    if (!data?.access_token) return null
    return data
  } catch (err) {
    console.error('GitHub token refresh error:', err)
    return null
  }
}

/**
 * Mark an account's OAuth tokens as invalid by clearing stored token fields.
 */
async function invalidateAccountTokens(accountId: string) {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        access_token: null,
        refresh_token: null,
        expires_at: null,
        token_type: null,
        scope: null,
        id_token: null,
        session_state: null,
        oauth_token: null,
        oauth_token_secret: null
      }
    })
  } catch (err) {
    console.error('Failed to invalidate account tokens:', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    const { provider } = body
    
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }
    
    // Get the account for this provider
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: provider
      }
    })
    
    if (!account && provider !== 'current') {
      return NextResponse.json(
        { error: 'Provider not linked' },
        { status: 400 }
      )
    }
    
    let updates: UpdateUserPayload = {}
    
  switch (provider) {
    case 'nostr':
        if (account?.providerAccountId) {
          const nostrProfile = await fetchNostrProfile(account.providerAccountId)
          if (nostrProfile) {
            const nextUpdates: UpdateUserPayload = {}
            const profile = nostrProfile as Record<string, unknown>

            // Apply validation to all profile fields from Nostr
            const name = validateUsername(profile.name)
            const picture = validateImageUrl(profile.picture)
            const banner = validateImageUrl(profile.banner)
            const nip05 = validateNip05(profile.nip05)
            const lud16 = validateLud16(profile.lud16)

            if (name) nextUpdates.username = name
            if (picture) nextUpdates.avatar = picture
            if (banner) nextUpdates.banner = banner
            if (nip05) nextUpdates.nip05 = nip05
            if (lud16) nextUpdates.lud16 = lud16
            updates = nextUpdates
          }
        }
        break
        
      case 'github':
        if (account?.access_token) {
          try {
            const doFetch = async (token: string) =>
              fetch('https://api.github.com/user', {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json'
                }
              })

            let response = await doFetch(account.access_token)

            if (response.status === 401) {
              console.warn('GitHub API returned 401. Attempting token refresh...')

              if (account.refresh_token) {
                const refreshed = await refreshGithubAccessToken(account.refresh_token)
                if (refreshed?.access_token) {
                  // Persist refreshed tokens
                  const newExpiresAt = refreshed.expires_in
                    ? Math.floor(Date.now() / 1000) + Number(refreshed.expires_in)
                    : null
                  await prisma.account.update({
                    where: { id: account.id },
                    data: {
                      access_token: refreshed.access_token,
                      refresh_token: refreshed.refresh_token ?? account.refresh_token,
                      token_type: refreshed.token_type ?? account.token_type,
                      scope: refreshed.scope ?? account.scope,
                      expires_at: newExpiresAt ?? null
                    }
                  })

                  // Retry once with new token
                  response = await doFetch(refreshed.access_token)

                  if (response.status === 401) {
                    console.error('GitHub API still 401 after refresh. Marking tokens invalid.')
                    await invalidateAccountTokens(account.id)
                    return NextResponse.json(
                      { error: 'GitHub authorization expired. Please reconnect your GitHub account.' },
                      { status: 401 }
                    )
                  }
                } else {
                  console.error('GitHub token refresh failed. Marking tokens invalid.')
                  await invalidateAccountTokens(account.id)
                  return NextResponse.json(
                    { error: 'GitHub authorization expired. Please reconnect your GitHub account.' },
                    { status: 401 }
                  )
                }
              } else {
                console.error('No GitHub refresh_token available. Marking tokens invalid.')
                await invalidateAccountTokens(account.id)
                return NextResponse.json(
                  { error: 'GitHub authorization missing or expired. Please reconnect your GitHub account.' },
                  { status: 401 }
                )
              }
            }

            if (response.ok) {
              const githubUser = await response.json()
              const nextUpdates: UpdateUserPayload = {}
              if (githubUser.name || githubUser.login) nextUpdates.username = githubUser.name || githubUser.login
              if (githubUser.avatar_url) nextUpdates.avatar = githubUser.avatar_url
              if (githubUser.bio) nextUpdates.banner = githubUser.bio
              if (githubUser.email) nextUpdates.email = githubUser.email
              updates = nextUpdates
            } else if (!response.ok) {
              console.error('Failed to fetch GitHub profile. Status:', response.status)
            }
          } catch (error) {
            console.error('Failed to fetch GitHub profile:', error)
          }
        }
        break

      case 'email':
        if (!account?.providerAccountId) {
          return NextResponse.json(
            { error: 'Email account is missing an identifier' },
            { status: 400 }
          )
        }
        {
          const normalizedEmail = sanitizeEmail(account.providerAccountId)
          const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { email: true }
          })
          if (!currentUser?.email) {
            updates = { email: normalizedEmail }
          } else if (currentUser.email !== normalizedEmail) {
            updates = { email: normalizedEmail }
          }
        }
        break
        
      case 'current':
        // No sync needed for current session
        return NextResponse.json({
          success: true,
          message: 'Current session data is already up to date'
        })
        
      default:
        return NextResponse.json(
          { error: 'Unsupported provider' },
          { status: 400 }
        )
    }
    
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: updates
      })
      
      return NextResponse.json({
        success: true,
        message: `Profile synced from ${provider}`,
        updated: Object.keys(updates)
      })
    }
    
    return NextResponse.json({
      success: true,
      message: 'No updates found from provider'
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync profile' },
      { status: 500 }
    )
  }
}
