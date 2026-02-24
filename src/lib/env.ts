import { z } from "zod"

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

const rawEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  PRIVKEY_ENCRYPTION_KEY: z.string().optional(),
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  VIEWS_CRON_SECRET: z.string().optional(),
}).passthrough()

export type RuntimeEnv = {
  NODE_ENV: NodeEnv
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

export function getEnv(): RuntimeEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  const raw = rawEnvSchema.parse(process.env)
  const NODE_ENV = parseNodeEnv(raw.NODE_ENV)

  const env: RuntimeEnv = {
    NODE_ENV,
    DATABASE_URL: normalize(raw.DATABASE_URL),
    NEXTAUTH_SECRET: normalize(raw.NEXTAUTH_SECRET),
    NEXTAUTH_URL: normalize(raw.NEXTAUTH_URL),
    PRIVKEY_ENCRYPTION_KEY: normalize(raw.PRIVKEY_ENCRYPTION_KEY),
    KV_REST_API_URL: normalize(raw.KV_REST_API_URL),
    KV_REST_API_TOKEN: normalize(raw.KV_REST_API_TOKEN),
    VIEWS_CRON_SECRET: normalize(raw.VIEWS_CRON_SECRET),
  }

  const issues: string[] = []
  const isProduction = env.NODE_ENV === "production"
  const hasValidNextAuthUrl = env.NEXTAUTH_URL ? isValidAbsoluteUrl(env.NEXTAUTH_URL) : false

  if (env.NEXTAUTH_URL && !hasValidNextAuthUrl) {
    issues.push("NEXTAUTH_URL must be a valid absolute URL.")
  }

  if (env.PRIVKEY_ENCRYPTION_KEY && !isValid32ByteKey(env.PRIVKEY_ENCRYPTION_KEY)) {
    issues.push("PRIVKEY_ENCRYPTION_KEY must be a 32-byte key in hex (64 chars) or base64 format.")
  }

  if (isProduction) {
    for (const key of PRODUCTION_REQUIRED_VARS) {
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

  cachedEnv = env
  return env
}
