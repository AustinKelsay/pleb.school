const EMAIL_SECURE_TRUE = /^(true|1|yes)$/i
const MIN_SMTP_PORT = 1
const MAX_SMTP_PORT = 65535
export const DEFAULT_SMTP_PORT = 587

const SMTP_TLS_CIPHERS = [
  "TLS_AES_256_GCM_SHA384",
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
].join(":")

export type EmailServerConfig = {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
  requireTLS: boolean
  tls: {
    minVersion: "TLSv1.2"
    ciphers: string
    rejectUnauthorized: true
  }
}

export type EmailRuntimeConfig = {
  server: EmailServerConfig
  from: string
}

type EmailConfigOptions = {
  strict?: boolean
  context?: string
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parsePort(rawPort: string | undefined): number {
  const parsed = Number.parseInt(rawPort ?? String(DEFAULT_SMTP_PORT), 10)
  if (!Number.isInteger(parsed) || parsed < MIN_SMTP_PORT || parsed > MAX_SMTP_PORT) {
    throw new Error("EMAIL_SERVER_PORT must be an integer between 1 and 65535.")
  }
  return parsed
}

function parseSecure(rawSecure: string | undefined, port: number): boolean {
  if (typeof rawSecure !== "string") {
    return port === 465
  }
  return EMAIL_SECURE_TRUE.test(rawSecure.trim())
}

/**
 * Resolve SMTP runtime config used by both NextAuth email provider and linking emails.
 *
 * - `strict=true`: throws on missing/invalid config (used for production hard-fail paths).
 * - `strict=false`: returns null when config is incomplete (used for dev/test flexibility).
 */
export function resolveEmailRuntimeConfig(
  rawEnv: NodeJS.ProcessEnv | undefined,
  options: EmailConfigOptions & { strict: true }
): EmailRuntimeConfig
export function resolveEmailRuntimeConfig(
  rawEnv?: NodeJS.ProcessEnv,
  options?: EmailConfigOptions
): EmailRuntimeConfig | null
export function resolveEmailRuntimeConfig(
  rawEnv: NodeJS.ProcessEnv = process.env,
  options: EmailConfigOptions = {}
): EmailRuntimeConfig | null {
  const strict = options.strict ?? false
  const context = options.context ?? "Email configuration"

  const host = normalize(rawEnv.EMAIL_SERVER_HOST)
  const user = normalize(rawEnv.EMAIL_SERVER_USER)
  const pass = normalize(rawEnv.EMAIL_SERVER_PASSWORD)
  const from = normalize(rawEnv.EMAIL_FROM)

  const missing: string[] = []
  if (!host) missing.push("EMAIL_SERVER_HOST")
  if (!user) missing.push("EMAIL_SERVER_USER")
  if (!pass) missing.push("EMAIL_SERVER_PASSWORD")
  if (!from) missing.push("EMAIL_FROM")

  let port: number
  try {
    port = parsePort(rawEnv.EMAIL_SERVER_PORT)
  } catch (error) {
    if (strict) {
      const message = error instanceof Error ? error.message : "Invalid EMAIL_SERVER_PORT."
      throw new Error(`${context}: ${message}`)
    }
    return null
  }

  if (missing.length > 0) {
    if (strict) {
      throw new Error(`${context}: Missing required SMTP env vars: ${missing.join(", ")}.`)
    }
    return null
  }

  const secure = parseSecure(rawEnv.EMAIL_SERVER_SECURE, port)

  return {
    server: {
      host: host!,
      port,
      secure,
      auth: {
        user: user!,
        pass: pass!,
      },
      // Enforce STARTTLS when not using implicit TLS (port 465).
      requireTLS: !secure,
      tls: {
        minVersion: "TLSv1.2",
        ciphers: SMTP_TLS_CIPHERS,
        rejectUnauthorized: true,
      },
    },
    from: from!,
  }
}
