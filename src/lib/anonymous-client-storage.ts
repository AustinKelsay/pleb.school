/**
 * Anonymous Client Storage
 *
 * Secure storage for anonymous session persistence using reconnect tokens.
 * No private keys are ever stored in localStorage.
 *
 * SECURITY PROPERTIES:
 * - Token is random, cannot sign Nostr events or derive private key
 * - Token rotates on every successful authentication
 * - Legacy privkey format auto-migrates to token format
 *
 * See: llm/context/profile-system-architecture.md
 */

const STORAGE_KEY = "ns.auth.persisted-anonymous"

/**
 * Secure format: Uses random reconnect token instead of private key
 */
export type PersistedAnonymousIdentity = {
  reconnectToken: string
  pubkey?: string
  userId?: string
  updatedAt: number
}

/**
 * LEGACY insecure format: Stored plaintext private key (deprecated)
 * Used only for migration detection and one-time read
 */
type LegacyPersistedIdentity = {
  privkey: string
  pubkey?: string
  userId?: string
  updatedAt: number
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

/**
 * Check if localStorage contains a legacy identity (with privkey)
 * Used to detect and migrate old format to new token format
 */
export function hasLegacyPersistedIdentity(): boolean {
  if (!isBrowser()) {
    return false
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw)
    // Legacy format has 'privkey' but NOT 'reconnectToken'
    return Boolean(parsed?.privkey && typeof parsed.privkey === "string" && !parsed?.reconnectToken)
  } catch {
    return false
  }
}

/**
 * Get legacy identity for one-time migration
 * Returns privkey + metadata so server can verify and issue new token
 */
export function getLegacyIdentityForMigration(): LegacyPersistedIdentity | null {
  if (!isBrowser()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as LegacyPersistedIdentity
    if (!parsed?.privkey || typeof parsed.privkey !== "string") {
      return null
    }

    // Don't return if this is already new format
    if ((parsed as { reconnectToken?: string }).reconnectToken) {
      return null
    }

    return parsed
  } catch {
    console.warn("Failed to read legacy persisted identity")
    return null
  }
}

/**
 * Read the cached anonymous identity (reconnect token) from browser storage.
 * Returns null if no usable record exists or the payload is malformed.
 */
export function getPersistedAnonymousIdentity(): PersistedAnonymousIdentity | null {
  if (!isBrowser()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as PersistedAnonymousIdentity
    if (!parsed?.reconnectToken || typeof parsed.reconnectToken !== "string") {
      return null
    }

    return parsed
  } catch {
    // Don't log error object to prevent leaking sensitive context
    console.warn("Failed to read persisted anonymous identity")
    return null
  }
}

/**
 * Check if there is any persisted anonymous identity (legacy or new format)
 */
export function hasAnyPersistedAnonymousIdentity(): boolean {
  return Boolean(getPersistedAnonymousIdentity()?.reconnectToken) || hasLegacyPersistedIdentity()
}

/**
 * Persist the anonymous identity using a secure reconnect token.
 * Never stores private keys in localStorage.
 */
export function persistAnonymousIdentity(payload: {
  reconnectToken: string
  pubkey?: string
  userId?: string
}) {
  if (!isBrowser() || !payload.reconnectToken) {
    return
  }

  try {
    const record: PersistedAnonymousIdentity = {
      reconnectToken: payload.reconnectToken,
      pubkey: payload.pubkey,
      userId: payload.userId,
      updatedAt: Date.now()
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Don't log error object to prevent leaking sensitive context
    console.warn("Failed to persist anonymous identity")
  }
}

/**
 * Remove the cached identity (e.g., when a stored token stops working or the user resets).
 */
export function clearPersistedAnonymousIdentity() {
  if (!isBrowser()) {
    return
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    console.warn("Failed to clear persisted anonymous identity")
  }
}
