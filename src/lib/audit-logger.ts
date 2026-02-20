/**
 * Audit logging for security-sensitive operations.
 *
 * Records structured audit events for:
 * - Account linking/unlinking
 * - Primary provider changes
 * - Purchase claims
 *
 * In production, consider integrating with:
 * - External logging service (e.g., Datadog, Splunk)
 * - Database table for persistent audit trail
 *
 * See: llm/context/api-patterns.md
 */

import { prisma } from "@/lib/prisma"
import logger from "@/lib/logger"
import type { Prisma } from "@/generated/prisma"

export type AuditAction =
  | 'account.link'
  | 'account.link.initiate'
  | 'account.unlink'
  | 'account.primary.change'
  | 'purchase.claim'
  | 'purchase.claim.failed'
  | 'purchase.admin_claim'  // Admin-initiated claims with adminReason audit trail

export interface AuditEvent {
  timestamp: string
  userId: string
  action: AuditAction
  details: Record<string, unknown>
  ip?: string
  userAgent?: string
}

function safeNormalizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>()

  try {
    const serialized = JSON.stringify(details, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString()
      }

      if (value && typeof value === "object") {
        if (seen.has(value)) {
          return "[Circular]"
        }
        seen.add(value)
      }

      return value
    })

    if (!serialized) {
      return {}
    }

    const parsed = JSON.parse(serialized)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return { value: parsed }
  } catch (err) {
    const detailsKeys = typeof details === "object" && details !== null
      ? Object.keys(details)
      : []

    return {
      serializationError: err instanceof Error ? err.message : "Unknown serialization error",
      detailsKeys,
    }
  }
}

/**
 * Log a security-sensitive audit event.
 *
 * @param userId - The user performing the action
 * @param action - The type of action being performed
 * @param details - Additional context about the action
 * @param request - Optional request object for extracting IP/user-agent
 */
export async function auditLog(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  request?: Request
): Promise<void> {
  const normalizedDetails = safeNormalizeDetails(details)

  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    details: normalizedDetails
  }

  // Extract request metadata if available
  if (request) {
    event.ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    event.userAgent = request.headers.get('user-agent') || 'unknown'
  }

  // Persist to database for a durable audit trail.
  // Wrap in try/catch - audit logging must never throw.
  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        details: event.details as Prisma.InputJsonValue,
        ip: event.ip,
        userAgent: event.userAgent,
      },
    })
  } catch (err) {
    logger.error("Failed to persist audit log event", {
      userId: event.userId,
      action: event.action,
      error: err instanceof Error ? err.message : "Unknown error",
    })
  }

  // Keep structured output for external log pipelines.
  try {
    logger.info("[AUDIT]", JSON.stringify(event))
  } catch (err) {
    logger.error("Failed to serialize audit event for logs", {
      userId: event.userId,
      action: event.action,
      error: err instanceof Error ? err.message : "Unknown error",
    })
  }
}

/**
 * Convenience wrapper that creates an audit logger bound to a request.
 */
export function createAuditLogger(request?: Request) {
  return async (userId: string, action: AuditAction, details: Record<string, unknown>) => {
    await auditLog(userId, action, details, request)
  }
}
