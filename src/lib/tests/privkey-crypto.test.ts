import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const MODULE_PATH = "../privkey-crypto"
const HEX_PRIVKEY = "f".repeat(64)
const HEX_KEY = "1a".repeat(32) // 32 bytes, hex encoded
const HEX_KEY_WITH_PREFIX = `0x${HEX_KEY}`
const BASE64_KEY = Buffer.from(HEX_KEY, "hex").toString("base64")

async function loadModuleWithEnv(secret?: string, nodeEnv?: string) {
  vi.resetModules()
  if (secret === undefined) {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  } else {
    process.env.PRIVKEY_ENCRYPTION_KEY = secret
  }
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv
  } else {
    process.env.NODE_ENV = "test"
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
    process.env.NODE_ENV = "test"
  })

  describe("encryption key handling", () => {
    it("encryption is always enabled", async () => {
      const { privkeyEncryptionEnabled } = await loadModuleWithEnv(HEX_KEY)
      expect(privkeyEncryptionEnabled).toBe(true)
    })

    it("encryption is enabled even without explicit key in dev (ephemeral key)", async () => {
      const { privkeyEncryptionEnabled } = await loadModuleWithEnv(undefined, "development")
      expect(privkeyEncryptionEnabled).toBe(true)
    })

    it("accepts hex keys", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const plain = HEX_PRIVKEY

      const encrypted = encryptPrivkey(plain)
      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(plain)

      const decrypted = decryptPrivkey(encrypted)
      expect(decrypted).toBe(plain)
    })

    it("accepts 0x-prefixed hex keys", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY_WITH_PREFIX)
      const plain = HEX_PRIVKEY

      const encrypted = encryptPrivkey(plain)
      expect(decryptPrivkey(encrypted)).toBe(plain)
    })

    it("accepts base64-encoded keys", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(BASE64_KEY)
      const plain = HEX_PRIVKEY

      expect(decryptPrivkey(encryptPrivkey(plain))).toBe(plain)
    })
  })

  describe("encryption/decryption", () => {
    it("encrypts and decrypts successfully", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const plain = HEX_PRIVKEY

      const encrypted = encryptPrivkey(plain)
      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(plain)

      const decrypted = decryptPrivkey(encrypted)
      expect(decrypted).toBe(plain)
    })

    it("returns null-ish inputs unchanged", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)

      expect(encryptPrivkey(null)).toBeNull()
      expect(encryptPrivkey(undefined)).toBeNull()
      expect(decryptPrivkey(null)).toBeNull()
      expect(decryptPrivkey(undefined)).toBeNull()
    })

    it("returns null when decryption fails (tampered payload)", async () => {
      const { encryptPrivkey, decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const encrypted = encryptPrivkey(HEX_PRIVKEY)!
      const tampered = Buffer.from(encrypted, "base64")
      tampered[15] = tampered[15] ^ 0b00000001 // flip a bit in auth tag
      const tamperedPayload = tampered.toString("base64")

      expect(decryptPrivkey(tamperedPayload)).toBeNull()
    })

    it("rejects plaintext hex privkeys (always requires encryption)", async () => {
      const { decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const result = decryptPrivkey(HEX_PRIVKEY)
      expect(result).toBeNull()
      expect(console.warn).toHaveBeenCalledWith(
        "Plaintext privkey encountered; rejecting. All private keys must be encrypted."
      )
    })

    it("returns null for malformed payloads (too short)", async () => {
      const { decryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const tooShortPayload = Buffer.from("abc").toString("base64") // decodes to <29 bytes
      expect(decryptPrivkey(tooShortPayload)).toBeNull()
    })
  })

  describe("cross-key behavior", () => {
    it("cannot decrypt with different key", async () => {
      const { encryptPrivkey } = await loadModuleWithEnv(HEX_KEY)
      const encrypted = encryptPrivkey(HEX_PRIVKEY)

      // Load module with different key
      const differentKey = "2b".repeat(32)
      const { decryptPrivkey } = await loadModuleWithEnv(differentKey)

      // Should fail to decrypt
      expect(decryptPrivkey(encrypted)).toBeNull()
    })
  })
})
