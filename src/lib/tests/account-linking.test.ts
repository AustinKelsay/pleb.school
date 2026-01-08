import { describe, expect, it } from "vitest"
import {
  isNostrFirstProvider,
  isOAuthFirstProvider,
  getProfileSourceForProvider,
  shouldSyncFromNostr,
  getProviderDisplayName
} from "../account-linking"

describe("account-linking helper functions", () => {
  describe("isNostrFirstProvider", () => {
    it("returns true for nostr provider", () => {
      expect(isNostrFirstProvider("nostr")).toBe(true)
    })

    it("returns true for anonymous provider", () => {
      expect(isNostrFirstProvider("anonymous")).toBe(true)
    })

    it("returns true for recovery provider", () => {
      expect(isNostrFirstProvider("recovery")).toBe(true)
    })

    it("returns false for email provider", () => {
      expect(isNostrFirstProvider("email")).toBe(false)
    })

    it("returns false for github provider", () => {
      expect(isNostrFirstProvider("github")).toBe(false)
    })

    it("returns false for null", () => {
      expect(isNostrFirstProvider(null)).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isNostrFirstProvider(undefined)).toBe(false)
    })

    it("returns false for empty string", () => {
      expect(isNostrFirstProvider("")).toBe(false)
    })

    it("returns false for unknown provider", () => {
      expect(isNostrFirstProvider("unknown")).toBe(false)
    })
  })

  describe("isOAuthFirstProvider", () => {
    it("returns true for email provider", () => {
      expect(isOAuthFirstProvider("email")).toBe(true)
    })

    it("returns true for github provider", () => {
      expect(isOAuthFirstProvider("github")).toBe(true)
    })

    it("returns false for nostr provider", () => {
      expect(isOAuthFirstProvider("nostr")).toBe(false)
    })

    it("returns false for anonymous provider", () => {
      expect(isOAuthFirstProvider("anonymous")).toBe(false)
    })

    it("returns false for recovery provider", () => {
      expect(isOAuthFirstProvider("recovery")).toBe(false)
    })

    it("returns false for null", () => {
      expect(isOAuthFirstProvider(null)).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isOAuthFirstProvider(undefined)).toBe(false)
    })

    it("returns false for empty string", () => {
      expect(isOAuthFirstProvider("")).toBe(false)
    })
  })

  describe("getProfileSourceForProvider", () => {
    it("returns 'nostr' for nostr provider", () => {
      expect(getProfileSourceForProvider("nostr")).toBe("nostr")
    })

    it("returns 'nostr' for anonymous provider", () => {
      expect(getProfileSourceForProvider("anonymous")).toBe("nostr")
    })

    it("returns 'nostr' for recovery provider", () => {
      expect(getProfileSourceForProvider("recovery")).toBe("nostr")
    })

    it("returns 'oauth' for email provider", () => {
      expect(getProfileSourceForProvider("email")).toBe("oauth")
    })

    it("returns 'oauth' for github provider", () => {
      expect(getProfileSourceForProvider("github")).toBe("oauth")
    })

    it("returns 'oauth' for unknown provider (fallback)", () => {
      expect(getProfileSourceForProvider("unknown")).toBe("oauth")
    })
  })

  describe("shouldSyncFromNostr", () => {
    it("returns true when profileSource is 'nostr'", () => {
      expect(shouldSyncFromNostr({ profileSource: "nostr" })).toBe(true)
    })

    it("returns false when profileSource is 'oauth'", () => {
      expect(shouldSyncFromNostr({ profileSource: "oauth" })).toBe(false)
    })

    it("returns true when no profileSource but primaryProvider is nostr", () => {
      expect(shouldSyncFromNostr({ primaryProvider: "nostr" })).toBe(true)
    })

    it("returns true when no profileSource but primaryProvider is anonymous", () => {
      expect(shouldSyncFromNostr({ primaryProvider: "anonymous" })).toBe(true)
    })

    it("returns true when no profileSource but primaryProvider is recovery", () => {
      expect(shouldSyncFromNostr({ primaryProvider: "recovery" })).toBe(true)
    })

    it("returns false when no profileSource but primaryProvider is email", () => {
      expect(shouldSyncFromNostr({ primaryProvider: "email" })).toBe(false)
    })

    it("returns false when no profileSource but primaryProvider is github", () => {
      expect(shouldSyncFromNostr({ primaryProvider: "github" })).toBe(false)
    })

    it("returns false when both profileSource and primaryProvider are null", () => {
      expect(shouldSyncFromNostr({ profileSource: null, primaryProvider: null })).toBe(false)
    })

    it("returns false with empty object", () => {
      expect(shouldSyncFromNostr({})).toBe(false)
    })

    it("profileSource 'nostr' takes precedence over OAuth primaryProvider", () => {
      expect(shouldSyncFromNostr({ profileSource: "nostr", primaryProvider: "github" })).toBe(true)
    })

    it("profileSource 'oauth' takes precedence over Nostr primaryProvider", () => {
      expect(shouldSyncFromNostr({ profileSource: "oauth", primaryProvider: "nostr" })).toBe(false)
    })
  })

  describe("getProviderDisplayName", () => {
    it("returns 'Nostr (NIP-07)' for nostr provider", () => {
      expect(getProviderDisplayName("nostr")).toBe("Nostr (NIP-07)")
    })

    it("returns 'Email' for email provider", () => {
      expect(getProviderDisplayName("email")).toBe("Email")
    })

    it("returns 'GitHub' for github provider", () => {
      expect(getProviderDisplayName("github")).toBe("GitHub")
    })

    it("returns 'Anonymous' for anonymous provider", () => {
      expect(getProviderDisplayName("anonymous")).toBe("Anonymous")
    })

    it("returns 'Recovery Key' for recovery provider", () => {
      expect(getProviderDisplayName("recovery")).toBe("Recovery Key")
    })

    it("returns provider name as-is for unknown provider", () => {
      expect(getProviderDisplayName("unknown")).toBe("unknown")
    })
  })
})
