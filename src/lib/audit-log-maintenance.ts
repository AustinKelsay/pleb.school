import { AuditLogAdapter } from "@/lib/db-adapter"

const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 90
const MIN_RETENTION_DAYS = 1
const MAX_RETENTION_DAYS = 3650

export type AuditLogMaintenanceSummary = {
  retentionDays: number
  cutoff: Date
  cutoffIso: string
  deletedCount: number
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Parses a retention days value. Returns null for non-digit or malformed input.
 * Valid input: purely decimal digits (after trim), within MIN/MAX range.
 */
function parseRetentionDays(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (
    parsed < MIN_RETENTION_DAYS ||
    parsed > MAX_RETENTION_DAYS
  ) {
    return null
  }
  return parsed
}

export function resolveAuditLogRetentionDays(
  rawEnv: NodeJS.ProcessEnv = process.env,
  options?: { strict?: boolean }
): number {
  const strict = options?.strict ?? false
  const rawValue = normalize(rawEnv.AUDIT_LOG_RETENTION_DAYS)
  if (!rawValue) {
    return DEFAULT_AUDIT_LOG_RETENTION_DAYS
  }

  const parsed = parseRetentionDays(rawValue)
  if (parsed !== null) {
    return parsed
  }

  if (strict) {
    throw new Error(
      `AUDIT_LOG_RETENTION_DAYS must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}.`
    )
  }

  return DEFAULT_AUDIT_LOG_RETENTION_DAYS
}

export function getAuditLogCutoffDate(
  retentionDays: number,
  now: Date = new Date()
): Date {
  if (!Number.isFinite(retentionDays) || !Number.isInteger(retentionDays) || retentionDays < 0) {
    throw new RangeError("retentionDays must be a non-negative integer.")
  }

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("now must be a valid Date.")
  }

  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

export async function purgeExpiredAuditLogs(params?: {
  retentionDays?: number
  now?: Date
}): Promise<AuditLogMaintenanceSummary> {
  const retentionDays = (() => {
    if (params?.retentionDays === undefined) {
      return resolveAuditLogRetentionDays(process.env)
    }
    if (
      !Number.isInteger(params.retentionDays) ||
      params.retentionDays < MIN_RETENTION_DAYS ||
      params.retentionDays > MAX_RETENTION_DAYS
    ) {
      throw new RangeError(
        `retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}.`
      )
    }
    return params.retentionDays
  })()
  const cutoff = getAuditLogCutoffDate(retentionDays, params?.now)
  const deletedCount = await AuditLogAdapter.deleteOlderThan(cutoff)

  return {
    retentionDays,
    cutoff,
    cutoffIso: cutoff.toISOString(),
    deletedCount,
  }
}

export async function anonymizeAuditLogsForUser(userId: string): Promise<number> {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) {
    throw new Error("userId is required to anonymize audit logs.")
  }
  return AuditLogAdapter.anonymizeByUserId(normalizedUserId)
}
