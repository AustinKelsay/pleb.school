export const TEMP_ENV_PLACEHOLDER_PREFIX = "__PLEB_TEMP_ENV__"

export function isTemporaryEnvPlaceholder(value: string | undefined | null): boolean {
  const normalized = value?.trim()
  return Boolean(normalized && normalized.startsWith(TEMP_ENV_PLACEHOLDER_PREFIX))
}

export function buildTemporaryEnvPlaceholder(label: string, hash: string): string {
  return `${TEMP_ENV_PLACEHOLDER_PREFIX}:${label}:${hash}`
}
