import { z } from "zod"

type NodeEnv = "development" | "test" | "production"

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

  if (env.NEXTAUTH_URL && !isValidAbsoluteUrl(env.NEXTAUTH_URL)) {
    issues.push("NEXTAUTH_URL must be a valid absolute URL.")
  }

  if (env.PRIVKEY_ENCRYPTION_KEY && !isValid32ByteKey(env.PRIVKEY_ENCRYPTION_KEY)) {
    issues.push("PRIVKEY_ENCRYPTION_KEY must be a 32-byte key in hex (64 chars) or base64 format.")
  }

  if (issues.length > 0) {
    throw new Error(`Environment validation failed:\n- ${issues.join("\n- ")}`)
  }

  cachedEnv = env
  return env
}
