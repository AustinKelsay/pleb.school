import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const MODULE_PATH = "../privkey-crypto"
const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32) // 32 bytes, hex encoded
const HEX_KEY_WITH_PREFIX = `0x${HEX_KEY}`
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

async function loadModuleWithEnv(secret?: string) {
  vi.resetModules()
  if (secret === undefined) {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  } else {
    process.env.PRIVKEY_ENCRYPTION_KEY = secret
  }
  return import(MODULE_PATH)
}

describe("privkey-crypto", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  })

  it("returns plaintext hex privkeys when encryption key is missing", async () => {
    const { decryptPrivkey, privkeyEncryptionEnabled } = await loadModuleWithEnv()

    expect(privkeyEncryptionEnabled).toBe(false)
    expect(decryptPrivkey(HEX_PRIVKEY)).toBe(HEX_PRIVKEY)
  })

  it("trims whitespace around plaintext privkeys when key is missing", async () => {
    const { decryptPrivkey } = await loadModuleWithEnv()

    expect(decryptPrivkey(`  ${HEX_PRIVKEY}\n`)).toBe(HEX_PRIVKEY)
  })

  it("encrypts and decrypts using a hex key", async () => {
    const { encryptPrivkey, decryptPrivkey, privkeyEncryptionEnabled } = await loadModuleWithEnv(HEX_KEY)
    const plain = HEX_PRIVKEY

    expect(privkeyEncryptionEnabled).toBe(true)
    const encrypted = encryptPrivkey(plain)
    expect(encrypted).toBeTruthy()
    expect(encrypted).not.toBe(plain)

    const decrypted = decryptPrivkey(encrypted)
    expect(decrypted).toBe(plain)
  })

  it("fails loudly for encrypted payloads when no key is configured", async () => {
    const withKey = await loadModuleWithEnv(HEX_KEY)
    const encrypted = withKey.encryptPrivkey("another-secret")
    expect(encrypted).toBeTruthy()

    const withoutKey = await loadModuleWithEnv()
    expect(withoutKey.decryptPrivkey(encrypted)).toBeNull()
  })

  it("accepts 0x-prefixed hex keys", async () => {
    const { encryptPrivkey, decryptPrivkey, privkeyEncryptionEnabled } = await loadModuleWithEnv(HEX_KEY_WITH_PREFIX)
    const plain = HEX_PRIVKEY

    expect(privkeyEncryptionEnabled).toBe(true)
    const encrypted = encryptPrivkey(plain)
    expect(decryptPrivkey(encrypted)).toBe(plain)
  })

  it("accepts base64-encoded keys", async () => {
    const { encryptPrivkey, decryptPrivkey, privkeyEncryptionEnabled } = await loadModuleWithEnv(BASE64_KEY)
    const plain = HEX_PRIVKEY

    expect(privkeyEncryptionEnabled).toBe(true)
    expect(decryptPrivkey(encryptPrivkey(plain))).toBe(plain)
  })

  it("falls back to plaintext when key length is invalid", async () => {
    const invalidHexKey = "aa".repeat(16) // 16 bytes only
    const { encryptPrivkey, decryptPrivkey, privkeyEncryptionEnabled } = await loadModuleWithEnv(invalidHexKey)

    expect(privkeyEncryptionEnabled).toBe(false)
    expect(encryptPrivkey("plain")).toBe("plain")
    expect(decryptPrivkey("plain")).toBe("plain")
  })

  it("returns null-ish inputs unchanged", async () => {
    const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)

    expect(encryptPrivkey(null)).toBeNull()
    expect(encryptPrivkey(undefined)).toBeNull()
    expect(decryptPrivkey(null)).toBeNull()
    expect(decryptPrivkey(undefined)).toBeNull()
  })

  it("returns stored value when decryption fails", async () => {
    const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
    const encrypted = encryptPrivkey("tamper-me")!
    const tampered = Buffer.from(encrypted, "base64")
    tampered[15] = tampered[15] ^ 0b00000001 // flip a bit in auth tag to break decryption
    const tamperedPayload = tampered.toString("base64")

    expect(decryptPrivkey(tamperedPayload)).toBeNull()
  })
})
