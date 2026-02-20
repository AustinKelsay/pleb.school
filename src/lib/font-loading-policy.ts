/**
 * Remote font loading policy.
 *
 * Goal: keep production deployments deterministic by default.
 * - Production default: remote font loading disabled
 * - Non-production default: remote font loading enabled (developer convenience)
 * - Explicit override via NEXT_PUBLIC_ENABLE_REMOTE_FONTS
 */

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) return null
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return null
}

export function isRemoteFontLoadingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const explicit = parseBooleanEnv(env.NEXT_PUBLIC_ENABLE_REMOTE_FONTS)
  if (explicit !== null) return explicit
  return env.NODE_ENV !== "production"
}

