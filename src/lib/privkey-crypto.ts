import crypto from "crypto"

// Generate an ephemeral key for development - this key is lost on restart
let ephemeralDevKey: Buffer | null = null

function generateEphemeralKey(): Buffer {
  if (!ephemeralDevKey) {
    ephemeralDevKey = crypto.randomBytes(32)
    console.warn(
      "WARNING: Using ephemeral encryption key for development. " +
      "Private keys will be unreadable after restart. " +
      "Set PRIVKEY_ENCRYPTION_KEY for persistence. " +
      "Generate one with: openssl rand -hex 32"
    )
  }
  return ephemeralDevKey
}

function getKey(): Buffer {
  const secret = process.env.PRIVKEY_ENCRYPTION_KEY

  if (!secret) {
    // In production, encryption key is required
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PRIVKEY_ENCRYPTION_KEY is required in production. " +
        "Generate one with: openssl rand -hex 32"
      )
    }
    // In development, use ephemeral key
    return generateEphemeralKey()
  }

  const normalizedSecret = secret.trim()
  const hexPattern = /^(?:0x)?[0-9a-fA-F]{64}$/
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/

  const attempts: Array<() => Buffer> = []
  if (hexPattern.test(normalizedSecret)) {
    const hexValue = normalizedSecret.startsWith("0x") ? normalizedSecret.slice(2) : normalizedSecret
    attempts.push(() => Buffer.from(hexValue, "hex"))
  }
  if (base64Pattern.test(normalizedSecret)) {
    attempts.push(() => Buffer.from(normalizedSecret, "base64"))
  }

  if (!attempts.length) {
    throw new Error(
      "PRIVKEY_ENCRYPTION_KEY is not valid hex or base64. " +
      "Must be a 32-byte (256-bit) key in hex (64 chars) or base64 format."
    )
  }

  for (const attempt of attempts) {
    try {
      const key = attempt()
      if (key.length === 32) {
        return key
      }
    } catch {
      continue
    }
  }

  throw new Error(
    "PRIVKEY_ENCRYPTION_KEY must be exactly 32 bytes (256 bits). " +
    "Generate one with: openssl rand -hex 32"
  )
}

// Lazily initialize key on first use to avoid errors during build/compile phase
let keyBuffer: Buffer | null = null
let keyInitError: Error | null = null

function getKeyBuffer(): Buffer {
  if (keyBuffer) return keyBuffer
  if (keyInitError) throw keyInitError

  try {
    keyBuffer = getKey()
    return keyBuffer
  } catch (error) {
    // In production, store the error to throw on actual use
    if (process.env.NODE_ENV === "production") {
      keyInitError = error as Error
      throw error
    }
    // For build/test contexts, create a temporary key
    keyBuffer = crypto.randomBytes(32)
    return keyBuffer
  }
}

export const privkeyEncryptionEnabled = true // Always enabled now

export function encryptPrivkey(plain: string | null | undefined): string | null {
  if (!plain) return plain ?? null

  const key = getKeyBuffer()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // payload layout: [iv|tag|ciphertext] base64
  return Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

export function decryptPrivkey(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null
  const trimmed = stored.trim()
  const hexPrivkeyPattern = /^(?:0x)?[0-9a-fA-F]{64}$/

  try {
    // Reject plaintext hex privkeys - they should always be encrypted
    if (hexPrivkeyPattern.test(trimmed)) {
      console.warn("Plaintext privkey encountered; rejecting. All private keys must be encrypted.")
      return null
    }

    const payload = Buffer.from(trimmed, "base64")
    // Expect iv(12) + tag(16) + ciphertext(>=1)
    if (payload.length < 29) {
      console.warn("Stored privkey does not match expected encrypted payload format.")
      return null
    }
    const key = getKeyBuffer()
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    // Basic sanity: privkeys are expected to be 64-char hex
    if (!/^[a-f0-9]{64}$/i.test(plain)) {
      console.warn("Decrypted privkey is not valid hex; treating as invalid.")
      return null
    }
    return plain
  } catch (error) {
    // If decryption fails, return null so callers can fail fast instead of using ciphertext
    console.warn("Failed to decrypt stored privkey; treating as missing.")
    return null
  }
}

export function decryptPrivkeyOrThrow(stored: string | null | undefined): string {
  const result = decryptPrivkey(stored)
  if (!result) {
    throw new Error("Missing private key")
  }
  return result
}
