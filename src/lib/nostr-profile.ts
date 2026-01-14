import { prisma } from './prisma'
import { RelayPool } from 'snstr'

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const pickFirstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const str = asString(value)
    if (str) return str
  }
  return null
}

// Validation constants for Nostr profile fields
const MAX_USERNAME_LENGTH = 256
const MAX_URL_LENGTH = 2048
const MAX_NIP05_LENGTH = 320
const MAX_LUD16_LENGTH = 320

/**
 * Validate and sanitize a username from Nostr profile.
 * Returns undefined if invalid.
 */
export function validateUsername(value: unknown): string | undefined {
  const str = asString(value)
  if (!str) return undefined
  const trimmed = str.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_USERNAME_LENGTH) return undefined
  // Remove control characters and normalize whitespace
  return trimmed.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ')
}

/**
 * Validate a URL for avatar/banner.
 * Must be http/https and reasonable length.
 */
export function validateImageUrl(value: unknown): string | undefined {
  const str = asString(value)
  if (!str) return undefined
  const trimmed = str.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return undefined

  try {
    const url = new URL(trimmed)
    // Only allow http/https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    return trimmed
  } catch {
    return undefined
  }
}

/**
 * Validate NIP-05 identifier format (user@domain.tld).
 */
export function validateNip05(value: unknown): string | undefined {
  const str = asString(value)
  if (!str) return undefined
  const trimmed = str.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.length > MAX_NIP05_LENGTH) return undefined

  // Basic NIP-05 format validation: local@domain
  const nip05Regex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
  if (!nip05Regex.test(trimmed)) return undefined

  return trimmed
}

/**
 * Validate LUD-16 lightning address format (user@domain.tld).
 */
export function validateLud16(value: unknown): string | undefined {
  const str = asString(value)
  if (!str) return undefined
  const trimmed = str.trim().toLowerCase()
  if (trimmed.length === 0 || trimmed.length > MAX_LUD16_LENGTH) return undefined

  // Lightning address format is same as email
  const lud16Regex = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
  if (!lud16Regex.test(trimmed)) return undefined

  return trimmed
}

/**
 * Fetch ALL Nostr profile metadata (kind 0) for a given pubkey.
 */
export async function fetchNostrProfile(pubkey: string): Promise<Record<string, unknown> | null> {
  let relayPool: RelayPool | null = null
  try {
    relayPool = new RelayPool([
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.damus.io'
    ])

    const profileEvent = await relayPool.get(
      ['wss://relay.nostr.band', 'wss://nos.lol', 'wss://relay.damus.io'],
      { kinds: [0], authors: [pubkey] },
      { timeout: 5000 }
    )

    if (!profileEvent || profileEvent.kind !== 0) {
      return null
    }

    try {
      return JSON.parse(profileEvent.content)
    } catch (parseError) {
      console.error('Failed to parse profile metadata:', parseError)
      return null
    }
  } catch (error) {
    console.error('Failed to fetch Nostr profile:', error)
    return null
  } finally {
    if (relayPool) {
      try {
        await relayPool.close()
      } catch (closeError) {
        console.error('Failed to close Nostr relay pool:', closeError)
      }
    }
  }
}

/**
 * Sync selected user fields from a Nostr profile into the database.
 */
export async function syncUserProfileFromNostr(userId: string, pubkey: string) {
  try {
    console.log(`Syncing profile from Nostr for user ${userId} (pubkey: ${pubkey.substring(0, 8)}...)`)
    const nostrProfile = await fetchNostrProfile(pubkey)

    if (!nostrProfile) {
      console.log('No Nostr profile found, keeping existing database values')
      return await prisma.user.findUnique({ where: { id: userId } })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatar: true,
        nip05: true,
        lud16: true,
        banner: true
      }
    })

    if (!currentUser) {
      throw new Error('User not found in database')
    }

    const updates: { username?: string; avatar?: string; nip05?: string; lud16?: string; banner?: string } = {}

    // Apply validation to all profile fields from Nostr
    const rawName = pickFirstString(nostrProfile.name, nostrProfile.username, nostrProfile.display_name)
    const rawPicture = pickFirstString(nostrProfile.picture, nostrProfile.avatar, nostrProfile.image)
    const rawBanner = asString(nostrProfile.banner)

    // Use validators to sanitize and validate profile data
    const name = validateUsername(rawName)
    const picture = validateImageUrl(rawPicture)
    const nip05 = validateNip05(nostrProfile.nip05)
    const lud16 = validateLud16(nostrProfile.lud16)
    const banner = validateImageUrl(rawBanner)

    if (name && name !== currentUser.username) {
      updates.username = name
    }

    if (picture && picture !== currentUser.avatar) {
      updates.avatar = picture
    }

    if (nip05 && nip05 !== currentUser.nip05) {
      updates.nip05 = nip05
    }

    if (lud16 && lud16 !== currentUser.lud16) {
      updates.lud16 = lud16
    }

    if (banner && banner !== currentUser.banner) {
      updates.banner = banner
    }

    if (Object.keys(updates).length > 0) {
      console.log(`Applying ${Object.keys(updates).length} profile updates from Nostr`)
      return await prisma.user.update({
        where: { id: userId },
        data: updates
      })
    }

    return await prisma.user.findUnique({ where: { id: userId } })
  } catch (error) {
    console.error('Failed to sync user profile from Nostr:', error)
    return await prisma.user.findUnique({ where: { id: userId } })
  }
}
