import { afterEach, describe, expect, it, vi } from "vitest"
import { fileURLToPath } from "url"
import crypto from "crypto"

type RateLimitResult = {
  success: boolean
  remaining: number
  resetIn: number
}

const DEFAULT_RUNTIME_CONFIG = {
  server: {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: {
      user: "smtp-user",
      pass: "smtp-password",
    },
    requireTLS: true,
    tls: {
      minVersion: "TLSv1.2" as const,
      ciphers: "TLS_AES_256_GCM_SHA384",
      rejectUnauthorized: true as const,
    },
  },
  from: "noreply@example.com",
}

const originalGithubClientId = process.env.GITHUB_CLIENT_ID
const originalGithubClientSecret = process.env.GITHUB_CLIENT_SECRET
const originalNodeEnv = process.env.NODE_ENV
const originalVercelEnv = process.env.VERCEL_ENV
const originalDatabaseUrl = process.env.DATABASE_URL
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalNextAuthUrl = process.env.NEXTAUTH_URL
const originalPrivkeyEncryptionKey = process.env.PRIVKEY_ENCRYPTION_KEY
const originalViewsCronSecret = process.env.VIEWS_CRON_SECRET
const originalAuditLogCronSecret = process.env.AUDIT_LOG_CRON_SECRET
const originalCi = process.env.CI
const RATE_LIMIT_MODULE_PATH = fileURLToPath(new URL("../rate-limit.ts", import.meta.url))
const EMAIL_CONFIG_MODULE_PATH = fileURLToPath(new URL("../email-config.ts", import.meta.url))
const mutableEnv = process.env as Record<string, string | undefined>

function restoreEnv() {
  if (originalGithubClientId === undefined) {
    delete process.env.GITHUB_CLIENT_ID
  } else {
    process.env.GITHUB_CLIENT_ID = originalGithubClientId
  }

  if (originalGithubClientSecret === undefined) {
    delete process.env.GITHUB_CLIENT_SECRET
  } else {
    process.env.GITHUB_CLIENT_SECRET = originalGithubClientSecret
  }

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv
  }

  if (originalVercelEnv === undefined) {
    delete process.env.VERCEL_ENV
  } else {
    process.env.VERCEL_ENV = originalVercelEnv
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl
  }

  if (originalNextAuthSecret === undefined) {
    delete process.env.NEXTAUTH_SECRET
  } else {
    process.env.NEXTAUTH_SECRET = originalNextAuthSecret
  }

  if (originalNextAuthUrl === undefined) {
    delete process.env.NEXTAUTH_URL
  } else {
    process.env.NEXTAUTH_URL = originalNextAuthUrl
  }

  if (originalPrivkeyEncryptionKey === undefined) {
    delete process.env.PRIVKEY_ENCRYPTION_KEY
  } else {
    process.env.PRIVKEY_ENCRYPTION_KEY = originalPrivkeyEncryptionKey
  }

  if (originalViewsCronSecret === undefined) {
    delete process.env.VIEWS_CRON_SECRET
  } else {
    process.env.VIEWS_CRON_SECRET = originalViewsCronSecret
  }

  if (originalAuditLogCronSecret === undefined) {
    delete process.env.AUDIT_LOG_CRON_SECRET
  } else {
    process.env.AUDIT_LOG_CRON_SECRET = originalAuditLogCronSecret
  }

  if (originalCi === undefined) {
    delete process.env.CI
  } else {
    process.env.CI = originalCi
  }
}

async function loadAuthModuleForEmailTests(params?: {
  runtimeConfig?: typeof DEFAULT_RUNTIME_CONFIG | null
  rateLimitResult?: RateLimitResult
  sendMailResult?: { rejected: string[]; pending: string[] }
  nodeEnv?: string
  vercelEnv?: string
  ci?: string
  resolveEmailError?: Error
}) {
  vi.resetModules()

  process.env.GITHUB_CLIENT_ID = "test-github-client-id"
  process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret"
  mutableEnv.NODE_ENV = params?.nodeEnv ?? "test"
  if (params?.vercelEnv === undefined) {
    delete process.env.VERCEL_ENV
  } else {
    process.env.VERCEL_ENV = params.vercelEnv
  }
  if (params?.ci === undefined) {
    delete process.env.CI
  } else {
    process.env.CI = params.ci
  }

  if (mutableEnv.NODE_ENV === "production") {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pleb_school?schema=public"
    process.env.NEXTAUTH_SECRET = "x".repeat(32)
    process.env.NEXTAUTH_URL = "https://pleb.school"
    process.env.PRIVKEY_ENCRYPTION_KEY = "ab".repeat(32)
    process.env.VIEWS_CRON_SECRET = "views-cron-secret"
    process.env.AUDIT_LOG_CRON_SECRET = "audit-log-cron-secret"
  }

  const checkRateLimit = vi.fn().mockResolvedValue(
    params?.rateLimitResult ?? { success: true, remaining: 2, resetIn: 60 }
  )
  const runtimeConfig = params && "runtimeConfig" in params
    ? params.runtimeConfig
    : DEFAULT_RUNTIME_CONFIG
  const resolveEmailRuntimeConfig = params?.resolveEmailError
    ? vi.fn().mockImplementation(() => {
      throw params.resolveEmailError
    })
    : vi.fn().mockReturnValue(runtimeConfig)

  const sendMail = vi.fn().mockResolvedValue(
    params?.sendMailResult ?? {
      rejected: [],
      pending: [],
    }
  )
  const createTransport = vi.fn().mockReturnValue({ sendMail })

  const mockRateLimitModule = () => ({
    checkRateLimit,
    RATE_LIMITS: {
      AUTH_MAGIC_LINK: { limit: 5, windowSeconds: 900 },
      AUTH_NOSTR: { limit: 3, windowSeconds: 3600 },
      AUTH_ANONYMOUS_RECONNECT: { limit: 3, windowSeconds: 3600 },
      AUTH_ANONYMOUS_PER_IP: { limit: 5, windowSeconds: 3600 },
      AUTH_ANONYMOUS_GLOBAL: { limit: 50, windowSeconds: 3600 },
    },
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
  })
  vi.doMock("../rate-limit", mockRateLimitModule)
  vi.doMock(RATE_LIMIT_MODULE_PATH, mockRateLimitModule)

  const mockEmailConfigModule = () => ({
    resolveEmailRuntimeConfig,
  })
  vi.doMock("../email-config", mockEmailConfigModule)
  vi.doMock(EMAIL_CONFIG_MODULE_PATH, mockEmailConfigModule)

  vi.doMock("nodemailer", () => ({
    createTransport,
  }))

  vi.doMock("next-auth/providers/email", () => ({
    default: (config: Record<string, unknown>) => ({
      id: "email",
      name: "Email",
      type: "email",
      ...config,
    }),
  }))

  const authModule = await import("../auth")
  const emailProvider = (authModule.authOptions.providers as Array<any>).find(
    (provider) => provider?.id === "email"
  )

  return {
    authModule,
    emailProvider,
    mocks: {
      checkRateLimit,
      resolveEmailRuntimeConfig,
      createTransport,
      sendMail,
    },
  }
}

describe("auth email provider runtime + magic link flow", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    restoreEnv()
  })

  it("skips EmailProvider registration when resolveEmailRuntimeConfig returns null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { emailProvider, mocks } = await loadAuthModuleForEmailTests({
      runtimeConfig: null,
    })

    expect(emailProvider).toBeUndefined()
    expect(mocks.resolveEmailRuntimeConfig).toHaveBeenCalledWith(process.env, {
      strict: false,
      context: "NextAuth EmailProvider",
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping EmailProvider registration outside production.")
    )
  })

  it("throws during auth module initialization when SMTP config is invalid in production", async () => {
    await expect(
      loadAuthModuleForEmailTests({
        nodeEnv: "production",
        vercelEnv: "production",
        resolveEmailError: new Error("NextAuth EmailProvider: Missing required SMTP env vars: EMAIL_FROM."),
      })
    ).rejects.toThrow("NextAuth EmailProvider: Missing required SMTP env vars: EMAIL_FROM.")
  })

  it("skips EmailProvider registration for preview deploys when SMTP config is incomplete", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { emailProvider, mocks } = await loadAuthModuleForEmailTests({
      nodeEnv: "production",
      vercelEnv: "preview",
      runtimeConfig: null,
    })

    expect(emailProvider).toBeUndefined()
    expect(mocks.resolveEmailRuntimeConfig).toHaveBeenCalledWith(process.env, {
      strict: false,
      context: "NextAuth EmailProvider",
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping EmailProvider registration outside production.")
    )
  })

  it("skips EmailProvider registration in non-deployment CI builds when SMTP config is incomplete", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { emailProvider, mocks } = await loadAuthModuleForEmailTests({
      nodeEnv: "production",
      ci: "true",
      runtimeConfig: null,
    })

    expect(emailProvider).toBeUndefined()
    expect(mocks.resolveEmailRuntimeConfig).toHaveBeenCalledWith(process.env, {
      strict: false,
      context: "NextAuth EmailProvider",
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping EmailProvider registration outside production.")
    )
  })

  it("throws a rate-limit error and logs a redacted email when checkRateLimit fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { emailProvider, mocks } = await loadAuthModuleForEmailTests({
      rateLimitResult: { success: false, remaining: 0, resetIn: 120 },
    })

    await expect(
      emailProvider.sendVerificationRequest({
        identifier: "alice@example.com",
        url: "https://pleb.school/auth/callback/email?token=abc",
        provider: {
          server: DEFAULT_RUNTIME_CONFIG.server,
          from: DEFAULT_RUNTIME_CONFIG.from,
        },
      })
    ).rejects.toThrow("Too many sign-in attempts. Please try again later.")

    const expectedHashedKey = `auth-magic-link:${crypto.createHash("sha256").update("alice@example.com").digest("hex")}`
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expectedHashedKey, 5, 900)
    expect(warnSpy).toHaveBeenCalledWith("Rate limit exceeded for magic link: a***@example.com")
    expect(mocks.createTransport).not.toHaveBeenCalled()
  })

  it("sends magic link email when rate limit passes", async () => {
    const { emailProvider, mocks } = await loadAuthModuleForEmailTests()
    const magicLinkUrl = "https://pleb.school/auth/callback/email?token=xyz"

    await emailProvider.sendVerificationRequest({
      identifier: "alice@example.com",
      url: magicLinkUrl,
      provider: {
        server: DEFAULT_RUNTIME_CONFIG.server,
        from: DEFAULT_RUNTIME_CONFIG.from,
      },
    })

    const expectedHashedKey = `auth-magic-link:${crypto.createHash("sha256").update("alice@example.com").digest("hex")}`
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expectedHashedKey, 5, 900)
    expect(mocks.createTransport).toHaveBeenCalledWith(DEFAULT_RUNTIME_CONFIG.server)
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        from: DEFAULT_RUNTIME_CONFIG.from,
        subject: "Sign in to pleb.school",
        html: expect.stringContaining(magicLinkUrl),
        text: expect.stringContaining(magicLinkUrl),
      })
    )
  })

  it("throws when transport reports rejected or pending recipients", async () => {
    const { emailProvider } = await loadAuthModuleForEmailTests({
      sendMailResult: {
        rejected: ["rejected@example.com"],
        pending: ["pending@example.com"],
      },
    })

    await expect(
      emailProvider.sendVerificationRequest({
        identifier: "alice@example.com",
        url: "https://pleb.school/auth/callback/email?token=def",
        provider: {
          server: DEFAULT_RUNTIME_CONFIG.server,
          from: DEFAULT_RUNTIME_CONFIG.from,
        },
      })
    ).rejects.toThrow("Email could not be sent to rejected@example.com, pending@example.com")
  })
})
