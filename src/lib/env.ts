import { z } from "zod"
import { createHash, randomBytes } from "crypto"

type NodeEnv = "development" | "test" | "production"
const MIN_NEXTAUTH_SECRET_LENGTH = 32
const PRODUCTION_REQUIRED_VARS: Array<keyof RuntimeEnv> = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "PRIVKEY_ENCRYPTION_KEY",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VIEWS_CRON_SECRET",
]
const PREVIEW_OPTIONAL_VARS = new Set<keyof RuntimeEnv>([
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VIEWS_CRON_SECRET",
])

const rawEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  VERCEL_DEPLOYMENT_ID: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  PRIVKEY_ENCRYPTION_KEY: z.string().optional(),
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  VIEWS_CRON_SECRET: z.string().optional(),
}).passthrough()

export type RuntimeEnv = {
  NODE_ENV: NodeEnv
  VERCEL_ENV?: string
  DATABASE_URL?: string
  NEXTAUTH_SECRET?: string
  NEXTAUTH_URL?: string
  PRIVKEY_ENCRYPTION_KEY?: string
  KV_REST_API_URL?: string
  KV_REST_API_TOKEN?: string
  VIEWS_CRON_SECRET?: string
}

let cachedEnv: RuntimeEnv | null = null

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === "production" || value === "test" || value === "development") {
    return value
  }
  return "development"
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol && parsed.host)
  } catch {
    return false
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function isValid32ByteKey(value: string): boolean {
  const normalized = value.trim()
  const hexPattern = /^(?:0x)?[0-9a-fA-F]{64}$/
  if (hexPattern.test(normalized)) {
    const hex = normalized.startsWith("0x") ? normalized.slice(2) : normalized
    return Buffer.from(hex, "hex").length === 32
  }

  try {
    return Buffer.from(normalized, "base64").length === 32
  } catch {
    return false
  }
}

function buildPreviewSecretFallback(raw: z.infer<typeof rawEnvSchema>): string {
  const seedParts = [
    normalize(raw.VERCEL_GIT_COMMIT_SHA),
    normalize(raw.VERCEL_DEPLOYMENT_ID),
    normalize(raw.VERCEL_URL),
  ].filter((part): part is string => Boolean(part))

  if (seedParts.length === 0) {
    console.warn(
      "Preview fallback secret seed has no VERCEL_GIT_COMMIT_SHA/VERCEL_DEPLOYMENT_ID/VERCEL_URL. " +
      "Adding runtime entropy as last-resort fallback; NextAuth sessions may be invalidated on cold starts."
    )
    seedParts.push(randomBytes(32).toString("hex"))
  }

  const seed = [...seedParts, "pleb-school-preview-nextauth-secret"].join("|")

  return createHash("sha256").update(seed).digest("hex")
}

export function getEnv(): RuntimeEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  const raw = rawEnvSchema.parse(process.env)
  const NODE_ENV = parseNodeEnv(raw.NODE_ENV)

  const env: RuntimeEnv = {
    NODE_ENV,
    VERCEL_ENV: normalize(raw.VERCEL_ENV),
    DATABASE_URL: normalize(raw.DATABASE_URL),
    NEXTAUTH_SECRET: normalize(raw.NEXTAUTH_SECRET) ?? normalize(raw.AUTH_SECRET),
    NEXTAUTH_URL: normalize(raw.NEXTAUTH_URL),
    PRIVKEY_ENCRYPTION_KEY: normalize(raw.PRIVKEY_ENCRYPTION_KEY),
    KV_REST_API_URL: normalize(raw.KV_REST_API_URL),
    KV_REST_API_TOKEN: normalize(raw.KV_REST_API_TOKEN),
    VIEWS_CRON_SECRET: normalize(raw.VIEWS_CRON_SECRET),
  }

  const issues: string[] = []
  const isProductionDeployment = env.NODE_ENV === "production"
  const isPreviewDeployment = env.VERCEL_ENV === "preview"

  // NextAuth reads secrets directly from process.env, so this preview fallback must
  // populate process.env.NEXTAUTH_SECRET/AUTH_SECRET in addition to env.NEXTAUTH_SECRET.
  // We set env.NEXTAUTH_SECRET for validation; process.env is mutated only after validation
  // passes to avoid leaving process.env in a mutated state if getEnv throws.
  let fallbackSecretForPreview: string | null = null
  if (isProductionDeployment && isPreviewDeployment && !env.NEXTAUTH_SECRET) {
    fallbackSecretForPreview = buildPreviewSecretFallback(raw)
    env.NEXTAUTH_SECRET = fallbackSecretForPreview
    console.warn(
      "NEXTAUTH_SECRET missing on preview deployment; using fallback secret (will set process.env after validation)."
    )
  }

  const hasValidNextAuthUrl = env.NEXTAUTH_URL ? isValidAbsoluteUrl(env.NEXTAUTH_URL) : false

  if (env.NEXTAUTH_URL && !hasValidNextAuthUrl) {
    issues.push("NEXTAUTH_URL must be a valid absolute URL.")
  }

  if (env.PRIVKEY_ENCRYPTION_KEY && !isValid32ByteKey(env.PRIVKEY_ENCRYPTION_KEY)) {
    issues.push("PRIVKEY_ENCRYPTION_KEY must be a 32-byte key in hex (64 chars) or base64 format.")
  }

  if (isProductionDeployment) {
    for (const key of PRODUCTION_REQUIRED_VARS) {
      if (isPreviewDeployment && PREVIEW_OPTIONAL_VARS.has(key)) {
        continue
      }
      if (!env[key]) {
        issues.push(`${key} is required in production.`)
      }
    }

    if (env.NEXTAUTH_URL && hasValidNextAuthUrl && !isHttpsUrl(env.NEXTAUTH_URL)) {
      issues.push("NEXTAUTH_URL must use https in production.")
    }

    if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < MIN_NEXTAUTH_SECRET_LENGTH) {
      issues.push(`NEXTAUTH_SECRET must be at least ${MIN_NEXTAUTH_SECRET_LENGTH} characters in production.`)
    }
  }

  if (issues.length > 0) {
    throw new Error(`Environment validation failed:\n- ${issues.join("\n- ")}`)
  }

  if (fallbackSecretForPreview) {
    process.env.NEXTAUTH_SECRET = fallbackSecretForPreview
    if (!normalize(process.env.AUTH_SECRET)) {
      process.env.AUTH_SECRET = fallbackSecretForPreview
    }
  }

  cachedEnv = env
  return env
}
