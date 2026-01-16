/**
 * Profile Data Aggregator
 * 
 * Fetches and aggregates profile data from all linked accounts
 * Respects the profileSource priority (nostr-first vs oauth-first)
 */

import { prisma } from '@/lib/prisma'
import { fetchNostrProfile } from '@/lib/nostr-profile'
import { slugifyUsername } from '@/lib/username-utils'
import { isNostrFirstProfile } from '@/lib/profile-priority'
import authConfig from '../../config/auth.json'

export interface LinkedAccountData {
  provider: string
  providerAccountId: string
  data: Record<string, any>
  isConnected: boolean
  isPrimary: boolean
  // Alternative values for fields present on this account, stored separately from `data`
  alternatives?: Record<string, { value: any; source: string }>
}

export interface AggregatedProfile {
  // Core fields with source tracking
  name?: { value: string; source: string }
  email?: { value: string; source: string }
  username?: { value: string; source: string }
  image?: { value: string; source: string }
  banner?: { value: string; source: string }
  about?: { value: string; source: string }
  
  // Social links
  website?: { value: string; source: string }
  github?: { value: string; source: string }
  twitter?: { value: string; source: string }
  location?: { value: string; source: string }
  company?: { value: string; source: string }
  
  // Nostr specific
  pubkey?: { value: string; source: string }
  nip05?: { value: string; source: string }
  lud16?: { value: string; source: string }
  
  // All linked accounts
  linkedAccounts: LinkedAccountData[]
  
  // Metadata
  primaryProvider: string | null
  profileSource: string | null
  totalLinkedAccounts: number
}

// Anonymous accounts get generated usernames/avatars; treat them as placeholders
const anonymousUsernamePrefix = authConfig.providers?.anonymous?.usernamePrefix || 'anon_'
const anonymousAvatarBase = authConfig.providers?.anonymous?.defaultAvatar || ''

function isAnonymousUsername(value?: string | null): boolean {
  return !!(value && value.startsWith(anonymousUsernamePrefix))
}

function isAnonymousAvatar(value?: string | null): boolean {
  return !!(value && anonymousAvatarBase && value.startsWith(anonymousAvatarBase))
}

/**
 * Fetch GitHub profile data using access token
 */
async function fetchGitHubProfile(accessToken: string): Promise<Record<string, any>> {
  const url = 'https://api.github.com/user'
  const maxAttempts = 3
  const baseDelayMs = 500
  const maxDelayMs = 4000
  const perAttemptTimeoutMs = 10000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `${attempt}/${maxAttempts}`
    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }, perAttemptTimeoutMs)

      // Handle rate limit explicitly
      if (response.status === 429) {
        if (attempt === maxAttempts) {
          const bodyText = await safeReadBodyText(response)
          console.error(`[GitHubProfile] Final rate-limit (429) failure on attempt ${attemptLabel}. body=${truncateForLog(bodyText)}`)
          return {}
        }
        const retryAfterHeader = response.headers.get('Retry-After')
        const retryAfterMs = parseRetryAfterHeader(retryAfterHeader) ?? calculateExponentialBackoffDelay(attempt, baseDelayMs, maxDelayMs)
        console.warn(`[GitHubProfile] Received 429. attempt=${attemptLabel} retryAfterMs=${retryAfterMs}`)
        await sleep(retryAfterMs)
        continue
      }

      // Retry on transient server errors
      if (response.status >= 500 && response.status <= 599) {
        if (attempt < maxAttempts) {
          const delayMs = calculateExponentialBackoffDelay(attempt, baseDelayMs, maxDelayMs)
          console.warn(`[GitHubProfile] Transient 5xx (${response.status}). attempt=${attemptLabel} retrying in ${delayMs}ms`)
          await sleep(delayMs)
          continue
        }
        const bodyText = await safeReadBodyText(response)
        console.error(`[GitHubProfile] Final 5xx failure after ${attemptLabel}. status=${response.status} body=${truncateForLog(bodyText)}`)
        return {}
      }

      // Non-retriable failures (4xx other than 429)
      if (!response.ok) {
        const bodyText = await safeReadBodyText(response)
        console.error(`[GitHubProfile] Non-retriable response. status=${response.status} attempt=${attemptLabel} body=${truncateForLog(bodyText)}`)
        return {}
      }

      const data = await response.json()
      return {
        name: data.name,
        email: data.email,
        username: data.login,
        image: data.avatar_url,
        about: data.bio,
        website: data.blog,
        location: data.location,
        company: data.company,
        twitter: data.twitter_username,
        github: data.login
      }
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError'
      if (attempt < maxAttempts) {
        const delayMs = calculateExponentialBackoffDelay(attempt, baseDelayMs, maxDelayMs)
        console.warn(`[GitHubProfile] ${isAbort ? 'Timeout' : 'Network'} error on attempt ${attemptLabel}. Retrying in ${delayMs}ms`, error)
        await sleep(delayMs)
        continue
      }
      console.error(`[GitHubProfile] Final failure after ${maxAttempts} attempts.`, error)
      return {}
    }
  }

  // Fallback – should not be reached
  return {}
}

/**
 * Delay the current async flow for the specified number of milliseconds.
 */
function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * Compute exponential backoff with jitter (bounded).
 */
function calculateExponentialBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1))
  const jitterPortion = Math.random() * (exp * 0.3)
  return Math.floor(exp + jitterPortion)
}

/**
 * Parse Retry-After header to milliseconds. Supports seconds or HTTP-date.
 */
function parseRetryAfterHeader(headerValue: string | null): number | null {
  if (!headerValue) return null
  const seconds = Number(headerValue)
  if (!Number.isNaN(seconds) && Number.isFinite(seconds)) return Math.max(0, Math.floor(seconds * 1000))
  const dateMs = Date.parse(headerValue)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now())
  return null
}

/**
 * Fetch with an AbortController-based timeout.
 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Read response body safely as text for logging without throwing.
 */
async function safeReadBodyText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/**
 * Truncate long strings for concise logs.
 */
function truncateForLog(text: string, maxLength: number = 1000): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…[truncated]`
}

/**
 * Aggregate profile data from all linked accounts
 */
export async function getAggregatedProfile(userId: string): Promise<AggregatedProfile> {
  // Fetch user with all linked accounts
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: true
    }
  })
  
  if (!user) {
    throw new Error('User not found')
  }
  
  // Initialize aggregated profile
  const aggregated: AggregatedProfile = {
    linkedAccounts: [],
    primaryProvider: user.primaryProvider,
    profileSource: user.profileSource,
    totalLinkedAccounts: user.accounts.length
  }

  // Allow richer data (GitHub, synced Nostr, etc.) to override generated anon defaults
  const shouldReplaceAnonymousIdentity = (
    existing: { value: string } | undefined,
    incoming: string | undefined
  ): boolean => {
    if (!existing || !incoming) return false
    return isAnonymousUsername(existing.value) && !isAnonymousUsername(incoming)
  }

  const shouldReplaceAnonymousAvatar = (
    existing: { value: string } | undefined,
    incoming: string | undefined
  ): boolean => {
    if (!existing || !incoming) return false
    return isAnonymousAvatar(existing.value) && !isAnonymousAvatar(incoming)
  }
  
  // Process each linked account
  for (const account of user.accounts) {
    const accountData: LinkedAccountData = {
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      data: {},
      isConnected: true,
      isPrimary: account.provider === user.primaryProvider
    }
    
    // Fetch provider-specific data
    switch (account.provider) {
      case 'github':
        if (account.access_token) {
          accountData.data = await fetchGitHubProfile(account.access_token)
        }
        break
        
      case 'nostr':
        if (account.providerAccountId) {
          const nostrProfile = await fetchNostrProfile(account.providerAccountId)
          if (nostrProfile) {
            accountData.data = {
              name: nostrProfile.name,
              username: nostrProfile.name,
              image: nostrProfile.picture,
              banner: nostrProfile.banner,
              about: nostrProfile.about,
              website: nostrProfile.website,
              nip05: nostrProfile.nip05,
              lud16: nostrProfile.lud16,
              location: nostrProfile.location,
              github: nostrProfile.github,
              twitter: nostrProfile.twitter,
              pubkey: account.providerAccountId
            }
          }
        }
        break
        
      case 'email':
        // Email provider only provides email
        accountData.data = {
          email: user.email
        }
        break
    }
    
    aggregated.linkedAccounts.push(accountData)
  }
  
  // Add data from User table columns (the "current DB profile")
  // This includes data from: provider syncs, manual edits, and registration.
  // Displayed as source 'profile' in the UI. See llm/context/profile-system-architecture.md
  // for details on how this fits into the priority order.
  const currentData: LinkedAccountData = {
    provider: 'current',
    providerAccountId: user.id,
    data: {
      name: user.username || undefined,
      username: user.username || undefined,
      email: user.email || undefined,
      image: user.avatar || undefined,
      banner: user.banner || undefined,
      nip05: user.nip05 || undefined,
      lud16: user.lud16 || undefined,
      pubkey: user.pubkey || undefined
    },
    isConnected: true,
    isPrimary: true
  }
  
  // Aggregate fields based on profileSource priority
  // See llm/context/profile-system-architecture.md "Profile Source Priority" for full explanation
  const isNostrFirst = isNostrFirstProfile(user.profileSource, user.primaryProvider)

  const nostrAccounts = aggregated.linkedAccounts.filter(a => a.provider === 'nostr')
  const nonNostrAccounts = aggregated.linkedAccounts.filter(a => a.provider !== 'nostr')

  // Build prioritized account list based on profileSource:
  // - Nostr-first: nostr → currentData (DB profile) → oauth providers
  //   (currentData serves as fallback/cache when Nostr unavailable, and captures manual edits)
  // - OAuth-first: currentData (DB profile) → oauth → nostr
  //   (DB profile is authoritative, Nostr is supplementary)
  const prioritizedAccounts = isNostrFirst
    ? [...nostrAccounts, currentData, ...nonNostrAccounts]
    : [currentData, ...nonNostrAccounts, ...nostrAccounts]
  
  // Aggregate each field from prioritized sources
  for (const account of prioritizedAccounts) {
    const source = account.provider === 'current' ? 'profile' : account.provider
    
    // Only set fields if they have values and aren't already set
    if (
      account.data.name &&
      (!aggregated.name || shouldReplaceAnonymousIdentity(aggregated.name, account.data.name))
    ) {
      aggregated.name = { value: account.data.name, source }
    }
    if (account.data.email && !aggregated.email) {
      aggregated.email = { value: account.data.email, source }
    }
    if (
      account.data.username &&
      (!aggregated.username || shouldReplaceAnonymousIdentity(aggregated.username, account.data.username))
    ) {
      aggregated.username = { value: account.data.username, source }
    }
    if (
      account.data.image &&
      (!aggregated.image || shouldReplaceAnonymousAvatar(aggregated.image, account.data.image))
    ) {
      aggregated.image = { value: account.data.image, source }
    }
    if (account.data.banner && !aggregated.banner) {
      aggregated.banner = { value: account.data.banner, source }
    }
    if (account.data.about && !aggregated.about) {
      aggregated.about = { value: account.data.about, source }
    }
    if (account.data.website && !aggregated.website) {
      aggregated.website = { value: account.data.website, source }
    }
    if (account.data.github && !aggregated.github) {
      aggregated.github = { value: account.data.github, source }
    }
    if (account.data.twitter && !aggregated.twitter) {
      aggregated.twitter = { value: account.data.twitter, source }
    }
    if (account.data.location && !aggregated.location) {
      aggregated.location = { value: account.data.location, source }
    }
    if (account.data.company && !aggregated.company) {
      aggregated.company = { value: account.data.company, source }
    }
    if (account.data.pubkey && !aggregated.pubkey) {
      aggregated.pubkey = { value: account.data.pubkey, source }
    }
    if (account.data.nip05 && !aggregated.nip05) {
      aggregated.nip05 = { value: account.data.nip05, source }
    }
    if (account.data.lud16 && !aggregated.lud16) {
      aggregated.lud16 = { value: account.data.lud16, source }
    }
  }
  
  // Also gather all available values for each field (not just the primary)
  for (const account of aggregated.linkedAccounts) {
    const source = account.provider
    
    // Add alternative values to the data structure
    for (const [key, value] of Object.entries(account.data)) {
      if (value && aggregated[key as keyof AggregatedProfile]) {
        // Store alternative sources without mutating the raw account data
        if (!account.alternatives) account.alternatives = {}
        account.alternatives[key] = { value, source }
      }
    }
  }

  // Backfill placeholder DB fields once we have real data from linked providers
  const pendingUpdates: {
    username?: string | null
    avatar?: string | null
    email?: string | null
  } = {}

  const isMeaningfulAvatar = (value?: string | null) =>
    value && !isAnonymousAvatar(value)

  const sanitizedAggregatedUsername = slugifyUsername(aggregated.username?.value)
  const sanitizedAggregatedName = slugifyUsername(aggregated.name?.value)

  const finalIdentity = (() => {
    if (!user.username || isAnonymousUsername(user.username)) {
      if (sanitizedAggregatedUsername && !isAnonymousUsername(sanitizedAggregatedUsername)) {
        return sanitizedAggregatedUsername
      }
      if (sanitizedAggregatedName && !isAnonymousUsername(sanitizedAggregatedName)) {
        return sanitizedAggregatedName
      }
      return user.username || null
    }
    return user.username
  })()

  if (
    finalIdentity &&
    (!user.username || isAnonymousUsername(user.username)) &&
    !isAnonymousUsername(finalIdentity)
  ) {
    pendingUpdates.username = finalIdentity
  }

  const finalAvatar = aggregated.image?.value || user.avatar || null
  if (
    finalAvatar &&
    (!user.avatar || isAnonymousAvatar(user.avatar)) &&
    isMeaningfulAvatar(finalAvatar)
  ) {
    pendingUpdates.avatar = finalAvatar
  }

  const finalEmail = aggregated.email?.value || null
  if (finalEmail && !user.email) {
    pendingUpdates.email = finalEmail
  }

  if (Object.keys(pendingUpdates).length > 0) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: pendingUpdates
      })
    } catch (error) {
      console.error('Failed to backfill placeholder profile fields:', error)
    }
  }
  
  return aggregated
}
