export const runtime = "nodejs"

import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  anonymizeAuditLogsForUser,
  purgeExpiredAuditLogs,
  resolveAuditLogRetentionDays,
} from "@/lib/audit-log-maintenance"

const bodySchema = z.object({
  retentionDays: z.number().int().min(1).max(3650).optional(),
  anonymizeUserId: z.string().trim().min(1).max(191).optional(),
})

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(/\s+/, 2)
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null
  }

  const normalized = token.trim()
  return normalized.length > 0 ? normalized : null
}

function tokenEquals(expected: string, provided: string): boolean {
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest()
  const providedHash = crypto.createHash("sha256").update(provided, "utf8").digest()
  return crypto.timingSafeEqual(expectedHash, providedHash)
}

function isLocalhostRequest(req: NextRequest): boolean {
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"])
  const hostname = req.nextUrl.hostname.toLowerCase()
  if (allowedHosts.has(hostname)) {
    return true
  }

  const rawHostHeader = req.headers.get("host")?.trim().toLowerCase()
  if (!rawHostHeader) {
    return false
  }

  const hostFromHeader = (() => {
    // RFC 3986 bracketed IPv6 literal, e.g. [::1]:3000
    if (rawHostHeader.startsWith("[")) {
      const endBracketIndex = rawHostHeader.indexOf("]")
      if (endBracketIndex === -1) {
        return null
      }
      return rawHostHeader.slice(1, endBracketIndex)
    }

    const firstColonIndex = rawHostHeader.indexOf(":")
    if (firstColonIndex === -1) {
      return rawHostHeader
    }

    // Unbracketed IPv6 literals contain multiple colons and no separate port segment.
    if (rawHostHeader.indexOf(":", firstColonIndex + 1) !== -1) {
      return rawHostHeader
    }

    return rawHostHeader.slice(0, firstColonIndex)
  })()

  return hostFromHeader ? allowedHosts.has(hostFromHeader) : false
}

function isAuthorized(req: NextRequest): boolean {
  const isProduction = process.env.NODE_ENV === "production"
  const expected = isProduction
    ? process.env.AUDIT_LOG_CRON_SECRET?.trim()
    : process.env.AUDIT_LOG_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim()

  if (!expected) {
    if (isProduction) {
      console.error(
        "AUDIT_LOG_CRON_SECRET is required in production for /api/audit/maintenance authorization."
      )
    } else {
      console.warn(
        "AUDIT_LOG_CRON_SECRET (or CRON_SECRET) is not set; /api/audit/maintenance requests will be rejected."
      )
    }
    return false
  }

  const bearerToken = extractBearerToken(req)

  // Query token support is opt-in for local/manual testing only.
  const allowQueryToken = !isProduction
    && process.env.ALLOW_URL_TOKEN === "true"
    && isLocalhostRequest(req)
  const queryToken = allowQueryToken
    ? req.nextUrl.searchParams.get("token")?.trim() ?? null
    : null

  const provided = bearerToken || queryToken
  if (!provided) {
    return false
  }

  return tokenEquals(expected, provided)
}

async function runMaintenance({
  retentionDays,
  anonymizeUserId,
}: {
  retentionDays?: number
  anonymizeUserId?: string
}) {
  const isProduction = process.env.NODE_ENV === "production"
  const resolvedRetentionDays = retentionDays ?? resolveAuditLogRetentionDays(process.env, { strict: isProduction })
  const purgeSummary = await purgeExpiredAuditLogs({ retentionDays: resolvedRetentionDays })

  const anonymizedCount = anonymizeUserId
    ? await anonymizeAuditLogsForUser(anonymizeUserId)
    : 0

  return {
    deletedCount: purgeSummary.deletedCount,
    cutoff: purgeSummary.cutoffIso,
    retentionDays: purgeSummary.retentionDays,
    anonymizedCount,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runMaintenance({})
    return NextResponse.json(result)
  } catch (error) {
    console.error("Audit log maintenance failed:", error)
    return NextResponse.json({ error: "Failed to run audit maintenance" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let parsedBody: z.infer<typeof bodySchema>
  try {
    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      console.error("Invalid audit maintenance request body.", {
        issueCount: parsed.error.issues.length,
      })
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    parsedBody = parsed.data
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const result = await runMaintenance(parsedBody)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Audit log maintenance failed:", error)
    return NextResponse.json({ error: "Failed to run audit maintenance" }, { status: 500 })
  }
}
