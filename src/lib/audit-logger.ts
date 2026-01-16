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

/**
 * Log a security-sensitive audit event.
 *
 * @param userId - The user performing the action
 * @param action - The type of action being performed
 * @param details - Additional context about the action
 * @param request - Optional request object for extracting IP/user-agent
 */
export function auditLog(
  userId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  request?: Request
): void {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    details
  }

  // Extract request metadata if available
  if (request) {
    event.ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    event.userAgent = request.headers.get('user-agent') || 'unknown'
  }

  // Log as structured JSON for easy parsing by log aggregators
  // Wrap in try/catch - audit logging must never throw or lose records
  try {
    console.log('[AUDIT]', JSON.stringify(event))
  } catch (err) {
    // Serialization failed (BigInt, circular ref, etc.) - log safe fallback
    const safeEvent = {
      timestamp: event.timestamp,
      userId: event.userId,
      action: event.action,
      ip: event.ip,
      userAgent: event.userAgent,
      serializationError: err instanceof Error ? err.message : 'Unknown serialization error',
      detailsKeys: Object.keys(details)
    }
    console.log('[AUDIT]', JSON.stringify(safeEvent))
  }
}

/**
 * Convenience wrapper that creates an audit logger bound to a request.
 */
export function createAuditLogger(request?: Request) {
  return (userId: string, action: AuditAction, details: Record<string, unknown>) => {
    auditLog(userId, action, details, request)
  }
}
