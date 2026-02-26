import { afterEach, describe, expect, it, vi } from "vitest"
import { TEMP_ENV_PLACEHOLDER_PREFIX } from "../env-placeholders"

const MODULE_PATH = "../env"
const VALID_HEX_KEY = "ab".repeat(32)

const MANAGED_KEYS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_DEPLOYMENT_ID",
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "PRIVKEY_ENCRYPTION_KEY",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VIEWS_CRON_SECRET",
  "AUDIT_LOG_CRON_SECRET",
] as const

type ManagedKey = typeof MANAGED_KEYS[number]

const mutableEnv = process.env as Record<string, string | undefined>
const originalEnv: Record<ManagedKey, string | undefined> = Object.fromEntries(
  MANAGED_KEYS.map((key) => [key, mutableEnv[key]])
) as Record<ManagedKey, string | undefined>

function restoreManagedEnv() {
  for (const key of MANAGED_KEYS) {
    const original = originalEnv[key]
    if (original === undefined) {
      delete mutableEnv[key]
    } else {
      mutableEnv[key] = original
    }
  }
}

function clearManagedEnv() {
  for (const key of MANAGED_KEYS) {
    delete mutableEnv[key]
  }
}

async function loadEnvWith(overrides: Partial<Record<ManagedKey, string>>) {
  vi.resetModules()
  clearManagedEnv()

  for (const [key, value] of Object.entries(overrides)) {
    mutableEnv[key] = value
  }

  const { getEnv } = await import(MODULE_PATH)
  return getEnv()
}

function validProductionEnv(overrides: Partial<Record<ManagedKey, string>> = {}): Partial<Record<ManagedKey, string>> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/pleb_school?schema=public",
    NEXTAUTH_SECRET: "x".repeat(32),
    NEXTAUTH_URL: "https://pleb.school",
    PRIVKEY_ENCRYPTION_KEY: VALID_HEX_KEY,
    KV_REST_API_URL: "https://example.upstash.io",
    KV_REST_API_TOKEN: "upstash-token",
    VIEWS_CRON_SECRET: "cron-secret",
    AUDIT_LOG_CRON_SECRET: "audit-cron-secret",
    ...overrides,
  }
}

describe("env", () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    restoreManagedEnv()
  })

  it("defaults NODE_ENV to development when unset", async () => {
    const env = await loadEnvWith({})
    expect(env.NODE_ENV).toBe("development")
  })

  it("trims values during normalization", async () => {
    const env = await loadEnvWith({
      NODE_ENV: "test",
      NEXTAUTH_URL: " https://example.com ",
      NEXTAUTH_SECRET: " secret-value ",
      PRIVKEY_ENCRYPTION_KEY: ` ${VALID_HEX_KEY} `,
    })

    expect(env.NODE_ENV).toBe("test")
    expect(env.NEXTAUTH_URL).toBe("https://example.com")
    expect(env.NEXTAUTH_SECRET).toBe("secret-value")
    expect(env.PRIVKEY_ENCRYPTION_KEY).toBe(VALID_HEX_KEY)
  })

  it("rejects invalid NEXTAUTH_URL format", async () => {
    await expect(
      loadEnvWith({
        NODE_ENV: "test",
        NEXTAUTH_URL: "not-a-url",
      })
    ).rejects.toThrow("NEXTAUTH_URL must be a valid absolute URL.")
  })

  it("rejects invalid PRIVKEY_ENCRYPTION_KEY format", async () => {
    await expect(
      loadEnvWith({
        NODE_ENV: "test",
        PRIVKEY_ENCRYPTION_KEY: "short",
      })
    ).rejects.toThrow("PRIVKEY_ENCRYPTION_KEY must be a 32-byte key in hex (64 chars) or base64 format.")
  })

  it("bootstraps missing critical env vars in production with temporary placeholders", async () => {
    const env = await loadEnvWith({ NODE_ENV: "production" })

    expect(env.DATABASE_URL).toContain("postgresql://placeholder:")
    expect(env.NEXTAUTH_SECRET).toContain(TEMP_ENV_PLACEHOLDER_PREFIX)
    expect(env.NEXTAUTH_URL).toBe("https://placeholder.pleb.school")
    expect(env.PRIVKEY_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/)
    expect(env.KV_REST_API_URL).toContain(TEMP_ENV_PLACEHOLDER_PREFIX)
    expect(env.KV_REST_API_TOKEN).toContain(TEMP_ENV_PLACEHOLDER_PREFIX)
    expect(env.VIEWS_CRON_SECRET).toContain(TEMP_ENV_PLACEHOLDER_PREFIX)
    expect(env.AUDIT_LOG_CRON_SECRET).toContain(TEMP_ENV_PLACEHOLDER_PREFIX)
    expect(process.env.NEXTAUTH_SECRET).toBe(env.NEXTAUTH_SECRET)
    expect(process.env.AUTH_SECRET).toBe(env.NEXTAUTH_SECRET)
  })

  it("still enforces core production vars (except derived NEXTAUTH_SECRET) on Vercel preview deployments", async () => {
    const error = await loadEnvWith({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    }).catch((err) => err as Error)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain("DATABASE_URL is required in production.")
    expect(error.message).toContain("NEXTAUTH_URL is required in production.")
    expect(error.message).toContain("PRIVKEY_ENCRYPTION_KEY is required in production.")
    expect(error.message).not.toContain("NEXTAUTH_SECRET is required in production.")
  })

  it("allows preview deployments to omit non-NEXTAUTH_URL preview-optional vars", async () => {
    const env = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
        VIEWS_CRON_SECRET: "",
        AUDIT_LOG_CRON_SECRET: "",
      })
    )
    expect(env.NODE_ENV).toBe("production")
    expect(env.VERCEL_ENV).toBe("preview")
    expect(env.NEXTAUTH_URL).toBe("https://pleb.school")
    expect(env.KV_REST_API_URL).toBeUndefined()
    expect(env.KV_REST_API_TOKEN).toBeUndefined()
    expect(env.VIEWS_CRON_SECRET).toBeUndefined()
    expect(env.AUDIT_LOG_CRON_SECRET).toBeUndefined()
  })

  it("derives NEXTAUTH_URL from VERCEL_URL in preview when NEXTAUTH_URL is missing", async () => {
    const env = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_URL: "",
        VERCEL_URL: "plebschool-preview.vercel.app",
      })
    )

    expect(env.NEXTAUTH_URL).toBe("https://plebschool-preview.vercel.app")
  })

  it("derives NEXTAUTH_URL from VERCEL_URL in preview when NEXTAUTH_URL is missing", async () => {
    const env = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_URL: "",
        VERCEL_URL: "plebschool-preview.vercel.app",
      })
    )

    expect(env.NEXTAUTH_URL).toBe("https://plebschool-preview.vercel.app")
  })

  it("requires NEXTAUTH_URL to use https in production", async () => {
    await expect(
      loadEnvWith(
        validProductionEnv({
          NEXTAUTH_URL: "http://pleb.school",
        })
      )
    ).rejects.toThrow("NEXTAUTH_URL must use https in production.")
  })

  it("requires sufficiently long NEXTAUTH_SECRET in production", async () => {
    await expect(
      loadEnvWith(
        validProductionEnv({
          NEXTAUTH_SECRET: "short-secret",
        })
      )
    ).rejects.toThrow("NEXTAUTH_SECRET must be at least 32 characters in production.")
  })

  it("accepts a valid production environment", async () => {
    const env = await loadEnvWith(validProductionEnv())
    expect(env.NODE_ENV).toBe("production")
    expect(env.DATABASE_URL).toContain("postgresql://")
    expect(env.NEXTAUTH_URL).toBe("https://pleb.school")
  })

  it("accepts AUTH_SECRET as an alias for NEXTAUTH_SECRET", async () => {
    const env = await loadEnvWith(
      validProductionEnv({
        NEXTAUTH_SECRET: "",
        AUTH_SECRET: "y".repeat(32),
      })
    )

    expect(env.NEXTAUTH_SECRET).toBe("y".repeat(32))
  })

  it("derives a deterministic preview NEXTAUTH_SECRET fallback when missing", async () => {
    const first = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_SECRET: "",
        AUTH_SECRET: "",
        VERCEL_GIT_COMMIT_SHA: "abc123",
      })
    )
    const second = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_SECRET: "",
        AUTH_SECRET: "",
        VERCEL_GIT_COMMIT_SHA: "abc123",
      })
    )

    expect(first.NEXTAUTH_SECRET).toBe(second.NEXTAUTH_SECRET)
    expect(first.NEXTAUTH_SECRET).toHaveLength(64)
  })

  it("uses VERCEL_DEPLOYMENT_ID as a deterministic preview seed when commit/url seeds are missing", async () => {
    const first = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_SECRET: "",
        AUTH_SECRET: "",
        VERCEL_GIT_COMMIT_SHA: "",
        VERCEL_URL: "",
        VERCEL_DEPLOYMENT_ID: "dpl_123",
      })
    )
    const second = await loadEnvWith(
      validProductionEnv({
        VERCEL_ENV: "preview",
        NEXTAUTH_SECRET: "",
        AUTH_SECRET: "",
        VERCEL_GIT_COMMIT_SHA: "",
        VERCEL_URL: "",
        VERCEL_DEPLOYMENT_ID: "dpl_123",
      })
    )

    expect(first.NEXTAUTH_SECRET).toBe(second.NEXTAUTH_SECRET)
    expect(first.NEXTAUTH_SECRET).toHaveLength(64)
  })
})
