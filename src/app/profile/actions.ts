'use server'

/**
 * Profile Server Actions
 * 
 * Server actions for updating user profile information
 * - Basic profile updates (name, email for OAuth-first accounts only)
 * - Enhanced Nostr fields (nip05, lud16, banner)
 * - Respects dual authentication architecture (no Nostr profile updates for Nostr-first accounts)
 */

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'

import { z } from 'zod'
import { RelayPool, createEvent, type NostrEvent } from 'snstr'

import { authOptions } from '@/lib/auth'
import { fetchNostrProfile } from '@/lib/nostr-profile'
import { prisma } from '@/lib/prisma'
import { 
  PreferencesUpdateSchema,
  type PreferencesUpdate 
} from '@/types/account-preferences'
import { getRelays } from '@/lib/nostr-relays'

// Basic profile update schema for OAuth-first accounts
const BasicProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  email: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim()
        return trimmed === '' ? undefined : trimmed
      }
      return val
    },
    z.email({ error: 'Invalid email' }).optional()
  )
})

const optionalClearingField = (validator: z.ZodTypeAny) =>
  z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim()
        return trimmed === '' ? null : trimmed
      }
      return val
    },
    z.union([validator, z.null()]).optional()
  )

// Enhanced profile fields schema (allowed for all users)
const EnhancedProfileSchema = z.object({
  nip05: optionalClearingField(z.string().min(1, 'NIP05 address required')),
  lud16: optionalClearingField(z.string().min(1, 'Lightning address required')),
  banner: optionalClearingField(z.url({ error: 'Invalid banner URL' }))
})

const SignedKind0EventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.literal(0),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string()
})

const EnhancedProfileUpdateSchema = EnhancedProfileSchema.extend({
  signedEvent: SignedKind0EventSchema.optional()
})

export type BasicProfileData = z.infer<typeof BasicProfileSchema>
export type EnhancedProfileData = z.infer<typeof EnhancedProfileSchema>
export type SignedKind0Event = z.infer<typeof SignedKind0EventSchema>
export type AccountPreferencesData = PreferencesUpdate

/**
 * Update basic profile information (name, email)
 * Only allowed for OAuth-first accounts (email, GitHub)
 * Nostr-first accounts get their profile from Nostr relays
 */
export async function updateBasicProfile(data: BasicProfileData) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      throw new Error('Not authenticated')
    }

    // Check if user has privkey (OAuth-first) - only they can update basic profile
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { privkey: true, email: true, username: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Only OAuth-first accounts (those with privkey) can update basic profile
    if (!user.privkey) {
      throw new Error('Basic profile updates not allowed for Nostr-first accounts. Profile is managed via Nostr.')
    }

    const validatedData = BasicProfileSchema.parse(data)
    const updates: { username?: string; email?: string } = {}

    if (validatedData.name && validatedData.name !== user.username) {
      updates.username = validatedData.name
    }

    if (validatedData.email && validatedData.email !== user.email) {
      updates.email = validatedData.email
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, message: 'No changes to apply' }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updates
    })

    revalidatePath('/profile')
    
    return { 
      success: true, 
      message: 'Basic profile updated successfully',
      updates: Object.keys(updates)
    }
  } catch (error) {
    console.error('Error updating basic profile:', error)
    
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        message: 'Invalid data provided',
        errors: error.issues
      }
    }
    
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to update basic profile' 
    }
  }
}

/**
 * Update enhanced Nostr profile fields (nip05, lud16, banner)
 * Allowed for all users - these are database fields that complement Nostr profile
 * For Nostr-first accounts, these can be overridden by Nostr profile sync
 */
export async function updateEnhancedProfile(
  data: EnhancedProfileData & { signedEvent?: SignedKind0Event }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      throw new Error('Not authenticated')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        privkey: true,
        pubkey: true,
        username: true,
        avatar: true,
        nip05: true,
        lud16: true,
        banner: true
      }
    })

    if (!user) {
      throw new Error('User not found')
    }

    const { signedEvent, ...profilePayload } = EnhancedProfileUpdateSchema.parse(data)
    const isNostrFirst = !user.privkey

    const updates: { nip05?: string | null; lud16?: string | null; banner?: string | null } = {}
    const currentValues = {
      nip05: user.nip05 ?? null,
      lud16: user.lud16 ?? null,
      banner: user.banner ?? null
    }

    if (profilePayload.nip05 !== undefined && profilePayload.nip05 !== currentValues.nip05) {
      updates.nip05 = (profilePayload.nip05 as string | null) ?? null
    }

    if (profilePayload.lud16 !== undefined && profilePayload.lud16 !== currentValues.lud16) {
      updates.lud16 = (profilePayload.lud16 as string | null) ?? null
    }

    if (profilePayload.banner !== undefined && profilePayload.banner !== currentValues.banner) {
      updates.banner = (profilePayload.banner as string | null) ?? null
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, message: 'No changes to apply' }
    }

    if (isNostrFirst && !user.pubkey) {
      return {
        success: false,
        message: 'Missing Nostr public key. Please reconnect your Nostr account.'
      }
    }

    if (isNostrFirst && !signedEvent) {
      return {
        success: false,
        message: 'Nostr-first accounts must submit a signed kind 0 event from a NIP-07 extension.'
      }
    }

    const persistUpdates = async () => {
      await prisma.user.update({
        where: { id: session.user.id },
        data: updates
      })
    }

    let publishResult: Kind0PublishResult | null = null

    const publishPayload = {
      pubkey: user.pubkey,
      privkey: user.privkey,
      signedEvent,
      updatedFields: updates,
      fallbackProfile: {
        name: user.username ?? undefined,
        picture: user.avatar ?? undefined
      }
    } as const

    if (isNostrFirst) {
      try {
        publishResult = await publishKind0Profile(publishPayload)
        if (!publishResult.published) {
          throw new Error('Failed to publish profile metadata to relays.')
        }
      } catch (publishError) {
        console.error('[EnhancedProfile] Required Nostr publish failed:', publishError)
        return { 
          success: false,
          message: publishError instanceof Error
            ? publishError.message
            : 'Failed to publish profile metadata to relays.'
        }
      }

      await persistUpdates()
    } else {
      await persistUpdates()

      try {
        publishResult = await publishKind0Profile(publishPayload)
      } catch (publishError) {
        console.warn('[EnhancedProfile] Failed to publish to relays:', publishError)
        publishResult = { published: false, mode: null, profileContent: null }
      }
    }

    revalidatePath('/profile')

    const warningMessage = isNostrFirst 
      ? 'Note: These changes may be overridden if your Nostr profile contains different values.'
      : ''

    return { 
      success: true, 
      message: `Enhanced profile updated successfully. ${warningMessage}`,
      updates: Object.keys(updates),
      isNostrFirst,
      publishedToNostr: publishResult?.published ?? false,
      publishMode: publishResult?.mode ?? null,
      nostrProfile: publishResult?.profileContent ?? null
    }
  } catch (error) {
    console.error('Error updating enhanced profile:', error)
    
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        message: 'Invalid data provided',
        errors: error.issues
      }
    }
    
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to update enhanced profile' 
    }
  }
}

type EnhancedProfileUpdates = Partial<Record<keyof EnhancedProfileData, string | null>>

type Kind0PublishResult = {
  published: boolean
  mode: 'server-sign' | 'signed-event' | null
  profileContent: Record<string, any> | null
}

async function publishKind0Profile({
  pubkey,
  privkey,
  signedEvent,
  updatedFields,
  fallbackProfile
}: {
  pubkey?: string | null
  privkey?: string | null
  signedEvent?: SignedKind0Event
  updatedFields: EnhancedProfileUpdates
  fallbackProfile: { name?: string; picture?: string }
}): Promise<Kind0PublishResult> {
  const relays = getRelays('profile')
  if (!pubkey || relays.length === 0 || Object.keys(updatedFields).length === 0) {
    return { published: false, mode: null, profileContent: null }
  }

  if (signedEvent) {
    if (signedEvent.kind !== 0) {
      throw new Error('Signed event must be kind 0')
    }
    if (signedEvent.pubkey !== pubkey) {
      throw new Error('Signed event pubkey does not match current user')
    }

    const parsedContent = safeParseContent(signedEvent.content)
    enforceUpdatedFieldsMatch(parsedContent, updatedFields)
    await publishEventToRelays(relays, signedEvent)
    return { published: true, mode: 'signed-event', profileContent: parsedContent }
  }

  if (!privkey) {
    console.warn('Missing private key for publishing Nostr profile')
    return { published: false, mode: null, profileContent: null }
  }

  const existingProfile = await fetchNostrProfile(pubkey)
  if (!existingProfile) {
    console.warn('[EnhancedProfile] No existing Nostr profile found; creating metadata from fallback data')
  }
  const nextProfile = mergeProfileFields(existingProfile, updatedFields, fallbackProfile)

  const event = createEvent(
    {
      kind: 0,
      tags: [],
      content: JSON.stringify(nextProfile)
    },
    privkey
  ) as NostrEvent

  await publishEventToRelays(relays, event)
  return { published: true, mode: 'server-sign', profileContent: nextProfile }
}

function safeParseContent(content: string): Record<string, any> {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
    return {}
  } catch {
    return {}
  }
}

function enforceUpdatedFieldsMatch(
  parsedContent: Record<string, any>,
  updatedFields: EnhancedProfileUpdates
) {
  for (const [key, value] of Object.entries(updatedFields)) {
    if (value === null) {
      if (parsedContent[key] !== undefined && parsedContent[key] !== null && parsedContent[key] !== '') {
        throw new Error(`Signed event ${key} should be removed`)
      }
    } else if (typeof value === 'string' && value.length > 0) {
      if (parsedContent[key] !== value) {
        throw new Error(`Signed event ${key} does not match submitted value`)
      }
    }
  }
}

function mergeProfileFields(
  existingProfile: Record<string, any> | null,
  updatedFields: EnhancedProfileUpdates,
  fallbackProfile: { name?: string; picture?: string }
) {
  const nextProfile: Record<string, any> = existingProfile && typeof existingProfile === 'object'
    ? { ...existingProfile }
    : {}

  for (const [key, value] of Object.entries(updatedFields)) {
    if (value === null) {
      delete nextProfile[key]
    } else if (typeof value === 'string' && value.length > 0) {
      nextProfile[key] = value
    }
  }

  if (!nextProfile.name && fallbackProfile.name) {
    nextProfile.name = fallbackProfile.name
  }

  if (!nextProfile.display_name && fallbackProfile.name) {
    nextProfile.display_name = fallbackProfile.name
  }

  if (!nextProfile.picture && fallbackProfile.picture) {
    nextProfile.picture = fallbackProfile.picture
  }

  return nextProfile
}

async function publishEventToRelays(relays: string[], event: NostrEvent) {
  const relayPool = new RelayPool(relays)
  const publishResults = await Promise.allSettled(relayPool.publish(relays, event))
  await relayPool.close()

  const successful = publishResults.some(result => {
    if (result.status !== 'fulfilled') {
      return false
    }
    const value = result.value
    if (Array.isArray(value)) {
      // pool.publish returns an array of per-relay results
      return value.some(entry => entry?.success === true)
    }
    return (value as { success?: boolean })?.success === true
  })

  if (!successful) {
    throw new Error('Failed to publish profile metadata to any relay')
  }
}

/**
 * Update account preferences (profileSource, primaryProvider)
 * Allows users to configure how their profile data is managed
 */
export async function updateAccountPreferences(data: AccountPreferencesData) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      throw new Error('Not authenticated')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        profileSource: true,
        primaryProvider: true,
        accounts: {
          select: {
            provider: true
          }
        }
      }
    })

    if (!user) {
      throw new Error('User not found')
    }

    const validatedData = PreferencesUpdateSchema.parse(data)
    
    // Verify the primary provider exists in linked accounts
    const hasProvider = user.accounts.some(acc => acc.provider === validatedData.primaryProvider) || 
                       validatedData.primaryProvider === 'current'
    
    if (!hasProvider) {
      throw new Error('Selected primary provider is not linked to your account')
    }

    const updates: { profileSource?: string; primaryProvider?: string } = {}

    if (validatedData.profileSource !== user.profileSource) {
      updates.profileSource = validatedData.profileSource
    }

    if (validatedData.primaryProvider !== user.primaryProvider) {
      updates.primaryProvider = validatedData.primaryProvider
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, message: 'No changes to apply' }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: updates
    })

    revalidatePath('/profile')
    
    return { 
      success: true, 
      message: 'Account preferences updated successfully. Your profile will reflect the new settings on next sign-in.',
      updates: Object.keys(updates)
    }
  } catch (error) {
    console.error('Error updating account preferences:', error)
    
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        message: 'Invalid data provided',
        errors: error.issues
      }
    }
    
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to update account preferences' 
    }
  }
}

/**
 * Sync profile data from a specific provider
 * Respects the dual authentication architecture and profile source settings
 */
export async function syncProfileFromProvider(provider: string) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      throw new Error('Not authenticated')
    }

    const cookieHeader = cookies().toString()

    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/profile/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      },
      body: JSON.stringify({ provider })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Sync failed')
    }

    revalidatePath('/profile')
    
    return {
      success: true,
      message: data.message,
      profile: data.profile
    }
  } catch (error) {
    console.error('Error syncing profile:', error)
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to sync profile'
    }
  }
}
