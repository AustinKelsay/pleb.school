import crypto from "crypto"

const MISSING_KEY_MSG = "PRIVKEY_ENCRYPTION_KEY is not set; falling back to plaintext privkey storage. Do not use this in production."

let warnedMissingKey = false
let warnedPlaintextWithEncryption = false

function getKey(): Buffer | null {
  const secret = process.env.PRIVKEY_ENCRYPTION_KEY
  if (!secret) {
    if (!warnedMissingKey) {
      console.warn(MISSING_KEY_MSG)
      warnedMissingKey = true
    }
    return null
  }

  try {
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
      console.warn("PRIVKEY_ENCRYPTION_KEY is not valid hex or base64; falling back to plaintext privkey storage.")
      return null
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

    console.warn("PRIVKEY_ENCRYPTION_KEY must be 32 bytes (256 bits). Falling back to plaintext privkey storage.")
    return null
  } catch (error) {
    console.warn(`Failed to parse PRIVKEY_ENCRYPTION_KEY (${error instanceof Error ? error.message : 'unknown error'}); falling back to plaintext privkey storage.`)
    return null
  }
}

const keyBuffer = getKey()

export const privkeyEncryptionEnabled = Boolean(keyBuffer)

export function encryptPrivkey(plain: string | null | undefined): string | null {
  if (!plain) return plain ?? null
  if (!keyBuffer) return plain

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // payload layout: [iv|tag|ciphertext] base64
  return Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

export function decryptPrivkey(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null
  const trimmed = stored.trim()
  const hexPrivkeyPattern = /^(?:0x)?[0-9a-fA-F]{64}$/
  if (!keyBuffer) {
    if (hexPrivkeyPattern.test(trimmed)) {
      return trimmed
    }

    try {
      const payload = Buffer.from(trimmed, "base64")
      const looksEncrypted = payload.length >= 29 // iv(12) + tag(16) + >=1 byte ciphertext
      return looksEncrypted ? null : trimmed
    } catch {
      return trimmed
    }
  }

  try {
    if (hexPrivkeyPattern.test(trimmed)) {
      if (!warnedPlaintextWithEncryption) {
        console.warn("Plaintext privkey encountered while encryption is enabled; rejecting.")
        warnedPlaintextWithEncryption = true
      }
      return null
    }

    const payload = Buffer.from(trimmed, "base64")
    // Expect iv(12) + tag(16) + ciphertext(>=1)
    if (payload.length < 29) {
      console.warn("Stored privkey does not match expected encrypted payload format.")
      return null
    }
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv)
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
