/**
 * Account Linking System
 * ======================
 * 
 * This module provides utilities for linking multiple authentication methods
 * to a single user account, enabling cross-device access and authentication flexibility.
 * 
 * KEY CONCEPTS:
 * 
 * 1. PRIMARY PROVIDER:
 *    - Each user has one primary authentication provider
 *    - This determines which profile source is authoritative
 *    - Can be changed by the user in settings
 * 
 * 2. PROFILE SOURCE:
 *    - "nostr": Profile fields come from Nostr (for NIP07, Anonymous users)
 *    - "oauth": Profile fields come from OAuth provider (Email, GitHub)
 *    - Determines which fields get priority during profile updates
 * 
 * 3. ACCOUNT LINKING RULES:
 *    - Users can link multiple providers to one account
 *    - Each provider can only be linked to one user
 *    - Duplicate email/pubkey checks prevent accidental duplicate accounts
 * 
 * 4. PROFILE FIELD PRIORITIZATION:
 *    - Nostr-first: Nostr profile always wins, syncs on every login
 *    - OAuth-first: OAuth profile is authoritative, no Nostr sync
 *    - Can be switched by changing primaryProvider
 */

import { prisma } from './prisma'
import type { Prisma, User } from '@prisma/client'
import { generateKeypair } from 'snstr'
import { syncUserProfileFromNostr } from './nostr-profile'
import { encryptPrivkey, decryptPrivkey } from './privkey-crypto'

/**
 * Provider types that can be linked
 */
export type AuthProvider = 'nostr' | 'email' | 'github' | 'anonymous' | 'recovery'

function normalizeNostrPubkey(pubkey: string): string {
  const normalized = pubkey.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error('Invalid Nostr public key format')
  }
  return normalized
}

function normalizeProviderAccountId(provider: string, providerAccountId: string): string {
  if (provider === 'nostr') {
    return normalizeNostrPubkey(providerAccountId)
  }

  const trimmed = providerAccountId.trim()
  if (provider === 'email') {
    return trimmed.toLowerCase()
  }

  return trimmed
}

function buildPostLinkUserUpdate(
  user: Pick<User, 'primaryProvider' | 'profileSource' | 'pubkey' | 'privkey'>,
  provider: AuthProvider,
  providerAccountId: string
): Prisma.UserUpdateInput | null {
  const update: Prisma.UserUpdateInput = {}
  let mutated = false
  let nextPrimary = user.primaryProvider || null
  let nextProfileSource = user.profileSource || null

  if (provider === 'nostr') {
    if (user.pubkey !== providerAccountId) {
      update.pubkey = providerAccountId
      mutated = true
    }
    if (user.privkey !== null) {
      update.privkey = null
      mutated = true
    }
    nextPrimary = 'nostr'
    nextProfileSource = 'nostr'
  } else if (!user.primaryProvider) {
    nextPrimary = provider
    nextProfileSource = getProfileSourceForProvider(provider)
  } else if (isOAuthFirstProvider(provider) && user.primaryProvider === 'anonymous') {
    nextPrimary = provider
    nextProfileSource = 'oauth'
  }

  if (nextPrimary && nextPrimary !== user.primaryProvider) {
    update.primaryProvider = nextPrimary
    mutated = true
  }

  if (nextProfileSource && nextProfileSource !== user.profileSource) {
    update.profileSource = nextProfileSource
    mutated = true
  }

  return mutated ? update : null
}

/**
 * Determines if a provider is Nostr-first (user controls identity)
 */
export function isNostrFirstProvider(provider: string | null | undefined): boolean {
  return ['nostr', 'anonymous', 'recovery'].includes(provider || '')
}

/**
 * Determines if a provider is OAuth-first (platform controls identity)
 */
export function isOAuthFirstProvider(provider: string | null | undefined): boolean {
  return ['email', 'github'].includes(provider || '')
}

/**
 * Get the appropriate profile source based on provider
 */
export function getProfileSourceForProvider(provider: string): 'nostr' | 'oauth' {
  return isNostrFirstProvider(provider) ? 'nostr' : 'oauth'
}

/**
 * Check if an account can be linked to a user
 * Returns error message if cannot link, null if can link
 */
export async function canLinkAccount(
  userId: string,
  provider: AuthProvider,
  providerAccountId: string
): Promise<string | null> {
  let normalizedAccountId: string
  try {
    normalizedAccountId = normalizeProviderAccountId(provider, providerAccountId)
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid account identifier'
  }

  // Check if this provider/account combination already exists
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: normalizedAccountId
      }
    },
    include: {
      user: true
    }
  })

  if (existingAccount) {
    if (existingAccount.userId === userId) {
      return 'This account is already linked to your profile'
    } else {
      return 'This account is already linked to another user'
    }
  }

  // Check if user already has this provider type linked
  const userAccounts = await prisma.account.findMany({
    where: {
      userId,
      provider
    }
  })

  if (userAccounts.length > 0) {
    return `You already have a ${provider} account linked`
  }

  return null
}

/**
 * Link a new authentication method to an existing user account
 * Used when a logged-in user wants to add another auth method
 */
export async function linkAccount(
  userId: string,
  provider: AuthProvider,
  providerAccountId: string,
  accountData?: {
    access_token?: string
    refresh_token?: string
    expires_at?: number
    token_type?: string
    scope?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    let normalizedAccountId: string
    try {
      normalizedAccountId = normalizeProviderAccountId(provider, providerAccountId)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid account identifier' }
    }

    // All validation and creation inside transaction to prevent race conditions
    await prisma.$transaction(async tx => {
      // Check if this provider/account combination already exists (inside transaction)
      const existingAccount = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId: normalizedAccountId
          }
        }
      })

      if (existingAccount) {
        if (existingAccount.userId === userId) {
          throw new Error('ALREADY_LINKED_SELF')
        } else {
          throw new Error('ALREADY_LINKED_OTHER')
        }
      }

      // Check if user already has this provider type linked
      const userAccounts = await tx.account.findMany({
        where: {
          userId,
          provider
        }
      })

      if (userAccounts.length > 0) {
        throw new Error('PROVIDER_ALREADY_LINKED')
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          primaryProvider: true,
          profileSource: true,
          pubkey: true,
          privkey: true
        }
      })

      if (!user) {
        throw new Error('USER_NOT_FOUND')
      }

      await tx.account.create({
        data: {
          userId,
          provider,
          providerAccountId: normalizedAccountId,
          type: 'credentials',
          ...accountData
        }
      })

      const userUpdate = buildPostLinkUserUpdate(user, provider, normalizedAccountId)
      if (userUpdate) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdate
        })
      }

      if (provider === 'anonymous' && !user.pubkey) {
        const keys = await generateKeypair()
        await tx.user.update({
          where: { id: userId },
          data: {
            pubkey: keys.publicKey,
            privkey: encryptPrivkey(keys.privateKey)
          }
        })
      }
    })

    if (provider === 'nostr') {
      try {
        await syncUserProfileFromNostr(userId, normalizedAccountId)
      } catch (syncError) {
        console.warn('Failed to sync Nostr profile after linking:', syncError)
      }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'USER_NOT_FOUND':
          return { success: false, error: 'User not found' }
        case 'ALREADY_LINKED_SELF':
          return { success: false, error: 'This account is already linked to your profile' }
        case 'ALREADY_LINKED_OTHER':
          return { success: false, error: 'This account is already linked to another user' }
        case 'PROVIDER_ALREADY_LINKED':
          return { success: false, error: `You already have a ${provider} account linked` }
      }
    }
    console.error('Failed to link account:', error)
    return { success: false, error: 'Failed to link account' }
  }
}

/**
 * Unlink an authentication method from a user account
 * Cannot unlink the last remaining auth method
 */
export async function unlinkAccount(
  userId: string,
  provider: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user with all accounts first (outside transaction for initial validation)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true }
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Check if this is the last account
    if (user.accounts.length <= 1) {
      return { success: false, error: 'Cannot unlink your last authentication method' }
    }

    // Find the account to unlink
    const accountToUnlink = user.accounts.find(a => a.provider === provider)
    if (!accountToUnlink) {
      return { success: false, error: 'Account not found' }
    }

    // Pre-generate keypair if needed (before transaction to avoid async issues)
    const shouldGenerateEphemeralKeys = provider === 'nostr' && !user.privkey
    let newKeypair: { publicKey: string; privateKey: string } | null = null
    if (shouldGenerateEphemeralKeys) {
      try {
        newKeypair = await generateKeypair()
      } catch (error) {
        console.error('Failed to generate fallback keypair:', error)
        return { success: false, error: 'Failed to finalize Nostr unlink. Please try again.' }
      }
    }

    // Prepare user updates
    const wasNostrPrimary = user.primaryProvider === 'nostr'
    const wasNostrProfileSource = user.profileSource === 'nostr'
    const remainingAccounts = user.accounts.filter(a => a.provider !== provider)
    const hasRemainingNostrFirst = remainingAccounts.some(a => isNostrFirstProvider(a.provider))
    const userUpdates: Prisma.UserUpdateInput = {}

    if (provider === 'email' && (user.email || user.emailVerified)) {
      userUpdates.email = null
      userUpdates.emailVerified = null
    }

    if (provider === 'nostr') {
      if (wasNostrPrimary || wasNostrProfileSource) {
        userUpdates.username = null
        userUpdates.avatar = null
      }
      userUpdates.nip05 = null
      userUpdates.lud16 = null
    }

    if (user.primaryProvider === provider) {
      if (remainingAccounts.length > 0) {
        const newPrimary = remainingAccounts[0]
        userUpdates.primaryProvider = newPrimary.provider
        userUpdates.profileSource = getProfileSourceForProvider(newPrimary.provider)
      } else {
        userUpdates.primaryProvider = null
        userUpdates.profileSource = null
      }
    }

    if (!hasRemainingNostrFirst && user.profileSource === 'nostr' && userUpdates.profileSource === undefined) {
      userUpdates.profileSource = 'oauth'
    }

    if (newKeypair) {
      userUpdates.pubkey = newKeypair.publicKey
      userUpdates.privkey = encryptPrivkey(newKeypair.privateKey)
    }

    // Execute delete and update atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.account.delete({
        where: { id: accountToUnlink.id }
      })

      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdates
        })
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to unlink account:', error)
    return { success: false, error: 'Failed to unlink account' }
  }
}

/**
 * Change the primary authentication provider for a user
 * This affects which profile source is authoritative
 */
export async function changePrimaryProvider(
  userId: string,
  newProvider: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify user has this provider linked
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: newProvider
      }
    })

    if (!account) {
      return { success: false, error: 'Provider not linked to your account' }
    }

    // Update primary provider and profile source
    await prisma.user.update({
      where: { id: userId },
      data: {
        primaryProvider: newProvider,
        profileSource: getProfileSourceForProvider(newProvider)
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to change primary provider:', error)
    return { success: false, error: 'Failed to change primary provider' }
  }
}

/**
 * Get all linked accounts for a user
 */
export async function getLinkedAccounts(userId: string): Promise<{
  accounts: Array<{
    provider: string
    isPrimary: boolean
    createdAt: Date
  }>
  primaryProvider: string | null
  profileSource: string | null
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true }
  })

  if (!user) {
    return {
      accounts: [],
      primaryProvider: null,
      profileSource: null
    }
  }

  return {
    accounts: user.accounts.map(account => ({
      provider: account.provider,
      isPrimary: account.provider === user.primaryProvider,
      createdAt: (account as any).createdAt || new Date()
    })),
    primaryProvider: user.primaryProvider,
    profileSource: user.profileSource
  }
}

/**
 * Handle account merging when linking reveals accounts should be merged
 * This is complex and should be done carefully to avoid data loss
 */
export async function mergeAccounts(
  primaryUserId: string,
  secondaryUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Start a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Move all accounts from secondary to primary
      await tx.account.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      // Move all content from secondary to primary
      await tx.course.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      await tx.resource.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      await tx.draft.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      await tx.courseDraft.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      // Move purchases
      await tx.purchase.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      // Move progress tracking
      await tx.userLesson.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      await tx.userCourse.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      // Move badges
      await tx.userBadge.updateMany({
        where: { userId: secondaryUserId },
        data: { userId: primaryUserId }
      })

      // Delete secondary user's sessions
      await tx.session.deleteMany({
        where: { userId: secondaryUserId }
      })

      // Delete secondary user
      await tx.user.delete({
        where: { id: secondaryUserId }
      })
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to merge accounts:', error)
    return { success: false, error: 'Failed to merge accounts' }
  }
}

/**
 * Determine which profile fields to use based on profile source
 * Used during login to decide whether to sync from Nostr or use OAuth data
 */
export function shouldSyncFromNostr(user: {
  profileSource?: string | null
  primaryProvider?: string | null
}): boolean {
  // If explicitly set to nostr source, sync from Nostr
  if (user.profileSource === 'nostr') return true
  
  // If no explicit source but primary is Nostr-first, sync from Nostr
  if (!user.profileSource && isNostrFirstProvider(user.primaryProvider)) return true
  
  // Otherwise don't sync from Nostr (OAuth is authoritative)
  return false
}

/**
 * Get display name for a provider
 */
export function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    nostr: 'Nostr (NIP-07)',
    email: 'Email',
    github: 'GitHub',
    anonymous: 'Anonymous',
    recovery: 'Recovery Key'
  }
  return names[provider] || provider
}
