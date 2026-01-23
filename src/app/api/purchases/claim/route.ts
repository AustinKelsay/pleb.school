import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import {
  ZAP_RECEIPT_KIND,
  decodeLnurl,
  fetchLnurlPayMetadata,
  getPublicKey,
  supportsNostrZaps,
  verifySignature
} from "snstr"
import type { NostrEvent } from "snstr"

import { authOptions } from "@/lib/auth"
import { auditLog } from "@/lib/audit-logger"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { resolvePriceForContent } from "@/lib/pricing"
import { NostrFetchService } from "@/lib/nostr-fetch-service"
import { parseBolt11Invoice, type ParsedBolt11Invoice } from "@/lib/bolt11"
import { normalizeHexPubkey, normalizeHexPrivkey } from "@/lib/nostr-keys"
import { isAdmin } from "@/lib/admin-utils"
import { DEFAULT_RELAYS, getRelays } from "@/lib/nostr-relays"
import { sanitizeRelayHints } from "@/lib/nostr-relays.server"

const paymentTypeEnum = z.enum(["zap", "manual", "comped", "refund"])

const payloadSchema = z.object({
  resourceId: z.uuid().optional(),
  // Course IDs are user-defined strings (e.g., 'welcome-to-pleb-school'), not UUIDs
  courseId: z.string().trim().min(1).optional(),
  amountPaid: z.number().int().nonnegative(),
  paymentType: paymentTypeEnum.optional(),
  zapReceiptId: z.string().trim().min(1).optional(),
  zapReceiptIds: z.array(z.string().trim().min(1)).optional(),
  zapReceiptJson: z.union([z.any(), z.array(z.any())]).optional(),
  zapRequestJson: z.any().optional(),
  invoice: z.string().trim().min(1).optional(),
  // paymentPreimage field removed - was accepted but never stored or validated
  nostrPrice: z.number().int().nonnegative().optional(),
  relayHints: z.array(z.string().trim().min(1)).optional(),
  // Full zap total is optional context for the caller; not persisted separately.
  zapTotalSats: z.number().int().nonnegative().optional(),
  // Admin-only field for audit trail when recording non-zap purchases
  adminReason: z.string().trim().min(1).max(500).optional(),
  // When true, extends receipt age limit for "Unlock with past zaps" flow.
  // Duplicate protection still applies; this only relaxes the freshness check.
  allowPastZaps: z.boolean().optional()
})

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 })
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}

type ZapValidationContext = {
  zapReceiptId: string
  invoiceHint?: string
  expectedRecipientPubkey?: string | null
  expectedEventId?: string | null
  sessionPubkey?: string | null
  allowedPayerPubkeys: string[]
  relayHints?: string[]
  zapReceiptEvent?: NostrEvent
  // When true, uses extended age limit for "Unlock with past zaps" flow
  allowPastZaps?: boolean
}

type ZapValidationResult = {
  amountSats: number
  invoice: string
  zapReceiptId: string
  zapReceipt: NostrEvent
  zapRequest: NostrEvent
}

type StoredReceipt = NostrEvent

function isNostrEventLike(value: unknown): value is NostrEvent {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pubkey === "string" &&
    typeof candidate.sig === "string" &&
    typeof candidate.kind === "number" &&
    typeof candidate.content === "string" &&
    typeof candidate.created_at === "number" &&
    Array.isArray(candidate.tags)
  )
}

function findTag(event: NostrEvent, name: string): string | null {
  if (!Array.isArray(event.tags)) return null
  const tag = event.tags.find((t) => t[0] === name && t[1])
  return tag?.[1] ?? null
}

function normalizeMaybeHex(value?: string | null): string | null {
  return value ? value.trim().toLowerCase() : null
}

function collectUsedReceiptIds(purchase: { invoice?: string | null; zapReceiptId?: string | null; zapReceiptJson?: any }): Set<string> {
  const ids = new Set<string>()
  if (purchase.zapReceiptId) ids.add(purchase.zapReceiptId.toLowerCase())
  if (purchase?.invoice) {
    const parsed = parseBolt11Invoice(purchase.invoice)
    if (parsed?.paymentHash) {
      ids.add(`invoice-fallback:${parsed.paymentHash}`)
    }
  }
  const receipts = purchase.zapReceiptJson
  if (Array.isArray(receipts)) {
    receipts.forEach((r) => {
      if (r?.id) ids.add(String(r.id).toLowerCase())
    })
  } else if (receipts && typeof receipts === "object" && receipts.id) {
    ids.add(String(receipts.id).toLowerCase())
  }
  return ids
}

function mergeReceipts(existing: unknown, incoming?: StoredReceipt | StoredReceipt[]): StoredReceipt[] | undefined {
  const list = toReceiptList(existing)
  const incomingList = toReceiptList(incoming)
  incomingList.forEach((inc) => {
    const incomingId = inc?.id ? String(inc.id).toLowerCase() : null
    const already = incomingId
      ? list.some((r) => r?.id && String(r.id).toLowerCase() === incomingId)
      : false
    if (!already) list.push(inc)
  })
  return list.length === 0 ? undefined : list
}

function toReceiptList(input: unknown): NostrEvent[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.filter(isNostrEventLike)
  }
  if (isNostrEventLike(input)) {
    return [input]
  }
  return []
}

async function validateZapProof(context: ZapValidationContext): Promise<ZapValidationResult> {
  const {
    zapReceiptId,
    invoiceHint,
    expectedRecipientPubkey,
    expectedEventId,
    sessionPubkey,
    allowedPayerPubkeys,
    relayHints,
    zapReceiptEvent,
    allowPastZaps
  } = context

  const relayList = Array.from(new Set([
    ...(relayHints ?? []),
    ...DEFAULT_RELAYS,
    ...getRelays("content"),
    ...getRelays("zapThreads")
  ]))

  const zapReceipt =
    zapReceiptEvent ??
    (await (async () => {
      // Simple retry to account for receipts that hit relays a few seconds late or only on hinted relays.
      const attempts = 6
      const delayMs = 800
      for (let i = 0; i < attempts; i++) {
        const found = await NostrFetchService.fetchEventById(zapReceiptId, undefined, relayList)
        if (found) return found
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
      return null
    })())

  if (!zapReceipt) {
    throw new Error("Zap receipt not found on relays. Wait a moment and try again.")
  }

  if (zapReceipt.kind !== ZAP_RECEIPT_KIND) {
    throw new Error("Invalid zap receipt: unexpected kind.")
  }

  if (!verifySignature(zapReceipt.id, zapReceipt.sig, zapReceipt.pubkey)) {
    throw new Error("Zap receipt signature is invalid.")
  }

  // Reject stale zap receipts to prevent replay attacks.
  // Default: 24 hours for fresh zaps, 1 year for "Unlock with past zaps" flow.
  // Configurable via MAX_RECEIPT_AGE_MS env var (milliseconds).
  // Note: Duplicate receipt protection (unique zapReceiptId + JSONB checks) is the
  // primary defense; this age check provides defense-in-depth.
  const DEFAULT_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
  const EXTENDED_RECEIPT_AGE_MS = 365 * 24 * 60 * 60 * 1000 // 1 year for past zaps
  const parsedEnvAge = process.env.MAX_RECEIPT_AGE_MS
    ? parseInt(process.env.MAX_RECEIPT_AGE_MS, 10)
    : null
  // Validate env var: must be a finite positive number, otherwise fall back to defaults
  const envMaxAge = (parsedEnvAge !== null && Number.isFinite(parsedEnvAge) && parsedEnvAge > 0)
    ? parsedEnvAge
    : null
  const maxReceiptAgeMs = allowPastZaps
    ? (envMaxAge ?? EXTENDED_RECEIPT_AGE_MS)
    : (envMaxAge ?? DEFAULT_RECEIPT_AGE_MS)
  const receiptAgeMs = Date.now() - (zapReceipt.created_at * 1000)
  if (receiptAgeMs > maxReceiptAgeMs) {
    // Compute human-readable age description from actual maxReceiptAgeMs
    const hours = maxReceiptAgeMs / (60 * 60 * 1000)
    const ageDescription = hours >= 24
      ? `${Math.round(hours / 24)} day${Math.round(hours / 24) !== 1 ? 's' : ''}`
      : `${Math.round(hours)} hour${Math.round(hours) !== 1 ? 's' : ''}`
    throw new Error(`Zap receipt is too old. Receipts must be less than ${ageDescription} old.`)
  }
  if (receiptAgeMs < -5 * 60 * 1000) {
    // Allow 5 minutes of clock skew into the future
    throw new Error("Zap receipt timestamp is in the future.")
  }

  const bolt11 = findTag(zapReceipt, "bolt11")
  const descriptionJson = findTag(zapReceipt, "description")
  if (!bolt11 || !descriptionJson) {
    throw new Error("Zap receipt is missing bolt11 or description tags.")
  }

  if (
    invoiceHint &&
    invoiceHint.trim() &&
    invoiceHint.trim().toLowerCase() !== bolt11.toLowerCase()
  ) {
    throw new Error("Invoice does not match zap receipt.")
  }

  const parsedInvoice = parseBolt11Invoice(bolt11)
  if (!parsedInvoice?.amountMsats || parsedInvoice.amountMsats <= 0) {
    throw new Error("Unable to read amount from zap invoice.")
  }

  const descriptionHash = parsedInvoice.descriptionHash?.toLowerCase()
  const calculatedHash = sha256Hex(descriptionJson)
  if (descriptionHash && calculatedHash !== descriptionHash) {
    throw new Error("Invoice description hash does not match zap request.")
  }

  let zapRequest: NostrEvent
  try {
    zapRequest = JSON.parse(descriptionJson) as NostrEvent
  } catch (error) {
    throw new Error("Zap receipt description is not valid JSON.")
  }

  if (zapRequest.kind !== 9734) {
    throw new Error("Zap request has unexpected kind.")
  }

  if (!verifySignature(zapRequest.id, zapRequest.sig, zapRequest.pubkey)) {
    throw new Error("Zap request signature is invalid.")
  }

  const requestedMsats = Number(findTag(zapRequest, "amount") ?? 0)
  if (Number.isFinite(requestedMsats) && requestedMsats > 0 && requestedMsats !== parsedInvoice.amountMsats) {
    throw new Error("Zap request amount does not match invoice amount.")
  }

  const recipientPubkey = normalizeHexPubkey(findTag(zapRequest, "p"))
  const normalizedExpectedRecipient = normalizeHexPubkey(expectedRecipientPubkey)
  if (normalizedExpectedRecipient && recipientPubkey !== normalizedExpectedRecipient) {
    throw new Error("Zap recipient does not match this content.")
  }

  const eTag = normalizeMaybeHex(findTag(zapRequest, "e"))
  const aTag = findTag(zapRequest, "a")
  if (expectedEventId) {
    const normalizedExpectedEvent = normalizeMaybeHex(expectedEventId)
    const matchesATag = (() => {
      if (!aTag || !normalizedExpectedEvent) return false
      const entries = aTag.split(",").map((t) => t.trim()).filter(Boolean)
      return entries.some((entry) => {
        const segments = entry.split(":")
        const eventIdSegment = segments[2]?.trim().toLowerCase()
        return eventIdSegment === normalizedExpectedEvent
      })
    })()

    const matchesEvent =
      (eTag && normalizedExpectedEvent && eTag === normalizedExpectedEvent) ||
      matchesATag
    if (!matchesEvent) {
      throw new Error("Zap receipt is not for this content.")
    }
  }

  const payerPubkey = normalizeHexPubkey(zapRequest.pubkey)
  const anonymousPayer = normalizeHexPubkey(
    zapRequest.tags.find((t) => t[0] === "P")?.[1] ?? undefined
  )
  const normalizedSessionPubkey = normalizeHexPubkey(sessionPubkey)

  const candidatePayers = [
    payerPubkey,
    anonymousPayer
  ].filter(Boolean) as string[]

  const allowed = allowedPayerPubkeys.map((p) => p.toLowerCase())

  const matchesAllowed = candidatePayers.some((p) => allowed.includes(p))

  if (!matchesAllowed) {
    const needsPubkey = allowed.length === 0
    throw new Error(
      needsPubkey
        ? "Purchase claims require a Nostr pubkey linked to your account. Link a pubkey and try again."
        : "Zap receipt sender does not match your account."
    )
  }

  const lnurlTag = findTag(zapRequest, "lnurl")
  if (lnurlTag) {
    let lnurlInput = lnurlTag
    try {
      const decodedLnurl = decodeLnurl(lnurlTag)
      lnurlInput = decodedLnurl ?? lnurlTag
    } catch {
      // keep original if decode fails; fetchLnurlPayMetadata can handle bech32 or direct URL
    }

    try {
      const metadata = await fetchLnurlPayMetadata(lnurlInput)
      if (!metadata || !supportsNostrZaps(metadata)) {
        throw new Error("LNURL endpoint does not support NIP-57 zaps.")
      }
      if (metadata.nostrPubkey && normalizeHexPubkey(metadata.nostrPubkey) !== normalizeHexPubkey(zapReceipt.pubkey)) {
        throw new Error("Zap receipt was not signed by the LNURL provider.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to validate LNURL metadata."
      throw new Error(message)
    }
  }

  const amountSats = Math.floor(parsedInvoice.amountMsats / 1000)
  if (amountSats <= 0) {
    throw new Error("Zap amount is zero.")
  }

  return {
    amountSats,
    invoice: bolt11,
    zapReceiptId,
    zapReceipt,
    zapRequest
  }
}

export async function POST(request: NextRequest) {
  // Get session outside try block so it's available in catch for audit logging
  const session = await getServerSession(authOptions)

  try {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return badRequest("Invalid JSON body")
    }
    const parsed = payloadSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest("Validation failed", parsed.error.issues)
    }

    const {
      resourceId,
      courseId,
      amountPaid,
      zapReceiptId,
      zapReceiptIds,
      zapReceiptJson,
      zapRequestJson,
      invoice,
      zapTotalSats,
      nostrPrice,
      relayHints: rawRelayHints,
      adminReason,
      allowPastZaps
    } = parsed.data
    const relayHints = sanitizeRelayHints(rawRelayHints)
    const priceHint = Number.isFinite(nostrPrice) ? Number(nostrPrice) : 0
    const paymentType = parsed.data.paymentType ?? "zap"
    const normalizedSessionPubkey = normalizeHexPubkey(session.user.pubkey)
    const normalizedSessionPrivkey = normalizeHexPrivkey((session.user as any)?.privkey)
    const derivedSessionPubkey = normalizedSessionPrivkey
      ? normalizeHexPubkey(getPublicKey(normalizedSessionPrivkey))
      : null

    // Exactly one of resourceId or courseId must be provided
    if (!resourceId && !courseId) {
      return badRequest("Provide either resourceId or courseId")
    }
    if (resourceId && courseId) {
      return badRequest("Provide only one of resourceId or courseId")
    }

    const priceResolution = await resolvePriceForContent({
      resourceId,
      courseId,
      nostrPriceHint: priceHint,
      onMismatch: ({ id, type, dbPrice, nostrPrice, chosen }) => {
        console.warn('Price mismatch detected for purchase claim', {
          id,
          type,
          dbPrice,
          nostrPrice,
          chosen
        });
      }
    })
    if (!priceResolution) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 })
    }

    // SECURITY: Reject claims where price is derived from client-supplied nostrPrice hint.
    // This prevents attackers from bypassing payment by sending nostrPrice: 0 for content
    // where the database price is null/missing. The database is the canonical source of truth
    // for pricing, and claims MUST use database-verified prices.
    if (priceResolution.priceSource === "nostr") {
      console.warn('Purchase claim rejected: price source is nostr hint, not database', {
        contentId: priceResolution.id,
        contentType: priceResolution.type,
        nostrPriceHint: priceResolution.nostrPriceHint,
        userId: session.user.id
      })
      return badRequest(
        "Content price could not be verified from the database. " +
        "This content may not be properly configured for purchases."
      )
    }

    // Zap claims must be bound to a specific identifier: prefer noteId, but allow pubkey-only content.
    if (paymentType === "zap" && !priceResolution.noteId && !priceResolution.ownerPubkey) {
      return badRequest("Content is missing both a Nostr noteId and publisher pubkey; cannot verify zap for this item.")
    }

    const priceSats = priceResolution.price

    // Everything below assumes a persisted Purchase row reflects validated payments.
    // We only trust server-verified zap amounts and receipt IDs—not client-supplied totals.
    const allowedPayerPubkeys = [
      normalizedSessionPubkey,
      derivedSessionPubkey
    ].filter(Boolean) as string[]

    if (paymentType === "zap" && allowedPayerPubkeys.length === 0) {
      return badRequest(
        "Link a Nostr pubkey to your account before claiming purchases. " +
        "This prevents others from reusing your zap receipts."
      )
    }

    let verifiedAmountSats = 0
    let verifiedInvoice: string | undefined
    let verifiedZapReceiptId: string | undefined
    let resolvedPaymentType = paymentType
    let requestZapProof: { zapReceiptJson?: StoredReceipt | StoredReceipt[]; zapRequestJson?: NostrEvent } | undefined
    let validatedReceipts: Array<{ id: string; amountSats: number; zapReceipt?: StoredReceipt }> = []

    // Normalize list of receipt IDs and inline receipts (to handle off-relay / delayed receipts)
    const submittedReceipts = [
      ...(zapReceiptIds ?? []),
      ...(zapReceiptId ? [zapReceiptId] : [])
    ].map((id) => id.trim()).filter(Boolean)
    const inlineReceiptEvents = toReceiptList(zapReceiptJson)

    if (paymentType === "zap") {
      // Validate inline receipts first (no relay fetch required)
      const proofs: ZapValidationResult[] = []
      if (inlineReceiptEvents.length > 0) {
        for (const receipt of inlineReceiptEvents) {
          const receiptId = receipt?.id ? String(receipt.id) : ""
          if (!receiptId) continue
          try {
            const proof = await validateZapProof({
              zapReceiptId: receiptId,
              zapReceiptEvent: receipt as NostrEvent,
              invoiceHint: invoice,
              expectedRecipientPubkey: priceResolution.ownerPubkey,
              expectedEventId: priceResolution.noteId,
              sessionPubkey: normalizedSessionPubkey,
              allowedPayerPubkeys,
              relayHints,
              allowPastZaps
            })
            proofs.push(proof)
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to verify zap receipt."
            return badRequest(message)
          }
        }
      }

      // Then validate any receipt IDs (will fetch from relays, including hints)
      const distinctReceipts = Array.from(new Set(submittedReceipts))
      for (const receiptId of distinctReceipts) {
        try {
          const already = proofs.some((p) => p.zapReceiptId.toLowerCase() === receiptId.toLowerCase())
          if (already) continue
          const proof = await validateZapProof({
            zapReceiptId: receiptId,
            invoiceHint: invoice,
            expectedRecipientPubkey: priceResolution.ownerPubkey,
            expectedEventId: priceResolution.noteId,
            sessionPubkey: normalizedSessionPubkey,
            allowedPayerPubkeys,
            relayHints,
            allowPastZaps
          })
          proofs.push(proof)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unable to verify zap receipt."
          return badRequest(message)
        }
      }

      if (proofs.length === 0) {
        return badRequest("Zap receipt not yet available. Retry after the receipt is published.")
      } else if (proofs.length > 0) {
        // Aggregate newly verified zaps
        verifiedAmountSats = proofs.reduce((sum, p) => sum + p.amountSats, 0)
        verifiedInvoice = proofs[0]?.invoice
        verifiedZapReceiptId = proofs[0]?.zapReceiptId
        resolvedPaymentType = "zap"
        validatedReceipts = proofs.map((p) => ({
          id: p.zapReceiptId,
          amountSats: p.amountSats,
          zapReceipt: p.zapReceipt
        }))
        requestZapProof = {
          zapReceiptJson: proofs.map((p) => p.zapReceipt),
          zapRequestJson: (zapRequestJson as NostrEvent) ?? proofs[0]?.zapRequest // representative request
        }
      }
    } else {
      const userIsAdmin = await isAdmin(session)
      if (!userIsAdmin) {
        return NextResponse.json(
          { error: "Only admins can record non-zap purchases." },
          { status: 403 }
        )
      }

      // Require adminReason for audit trail on admin-initiated claims
      if (!adminReason) {
        return badRequest("Admin claims require a reason for the audit trail.")
      }

      verifiedAmountSats = amountPaid
      verifiedInvoice = invoice
      verifiedZapReceiptId = zapReceiptId
    }

    // Track if this is an admin-initiated claim for post-transaction audit logging
    const isAdminClaim = !!adminReason

    // Wrap duplicate check and purchase creation/update in a serializable transaction
    // to prevent race conditions where concurrent requests could both pass duplicate checks
    const result = await prisma.$transaction(async (tx) => {
      // Prevent zap receipt reuse across purchases
      if (requestZapProof?.zapReceiptJson) {
        const receiptList = Array.isArray(requestZapProof.zapReceiptJson)
          ? requestZapProof.zapReceiptJson
          : [requestZapProof.zapReceiptJson]
        const receiptIds = receiptList
          .map((r: any) => (r?.id ? String(r.id) : null))
          .filter(Boolean) as string[]
        const normalizedReceiptIds = receiptIds.map((id) => id.toLowerCase())

        if (normalizedReceiptIds.length > 0) {
          // Check explicit column case-insensitively (unique index handles atomicity/race)
          const existingByReceipt = await tx.$queryRaw<{ userid: string }[]>`
            SELECT "userId" as userid
            FROM "Purchase"
            WHERE "zapReceiptId" IS NOT NULL
              AND lower("zapReceiptId") = ANY(${normalizedReceiptIds})
            LIMIT 1
          `
          const existing = existingByReceipt[0]
          if (existing && existing.userid !== session.user.id) {
            return {
              error: "zapReceiptId already used by another user",
              status: 409
            }
          }

          // Case-insensitive JSONB receipt check (handles array or single object storage)
          for (const id of normalizedReceiptIds) {
            const conflicts = await tx.$queryRaw<{ userid: string }[]>`
              SELECT "userId" as userid
              FROM "Purchase",
                   LATERAL jsonb_array_elements(
                     CASE
                       WHEN jsonb_typeof("zapReceiptJson") = 'array' THEN "zapReceiptJson"
                       ELSE jsonb_build_array("zapReceiptJson")
                     END
                   ) AS receipt(elem)
              WHERE "zapReceiptJson" IS NOT NULL
                AND jsonb_typeof(receipt.elem) = 'object'
                AND lower(receipt.elem->>'id') = ${id}
              LIMIT 1
            `
            const conflict = conflicts[0]
            if (conflict && conflict.userid !== session.user.id) {
              return {
                error: "zapReceiptId already used by another user",
                status: 409
              }
            }
          }
        }
      }

      const existingPurchase = await tx.purchase.findFirst({
        where: {
          userId: session.user.id,
          courseId: courseId ? courseId : null,
          resourceId: resourceId ? resourceId : null
        }
      })

      if (existingPurchase) {
        const usedReceipts = collectUsedReceiptIds(existingPurchase)
        const incomingReceipts = requestZapProof?.zapReceiptJson
          ? (Array.isArray(requestZapProof.zapReceiptJson)
              ? requestZapProof.zapReceiptJson
              : [requestZapProof.zapReceiptJson])
          : []

        const newReceipts = incomingReceipts.filter(
          (r: any) => r?.id && !usedReceipts.has(String(r.id).toLowerCase())
        )

        const newAmount = newReceipts.reduce((sum, r) => {
          const id = r?.id ? String(r.id).toLowerCase() : null
          const validated = id ? validatedReceipts.find((vr) => vr.id.toLowerCase() === id) : undefined
          const amt = validated ? validated.amountSats : 0
          return sum + amt
        }, 0)

        const amountToAdd =
          resolvedPaymentType === "zap"
            ? (requestZapProof?.zapReceiptJson ? (newReceipts.length > 0 ? newAmount : 0) : verifiedAmountSats)
            : verifiedAmountSats

        if (amountToAdd <= 0) {
          return {
            success: true,
            data: {
              purchase: existingPurchase,
              created: false,
              alreadyOwned: true,
              amountCredited: existingPurchase.amountPaid,
              priceSats,
              zapTotalSats
            }
          }
        }

        const zapRequestJsonInput = (
          requestZapProof?.zapRequestJson ?? (existingPurchase.zapRequestJson ?? undefined)
        ) as Prisma.InputJsonValue | undefined

        const updatedAmount = existingPurchase.amountPaid + amountToAdd
        const mergedZapReceipts = mergeReceipts(
          existingPurchase.zapReceiptJson,
          requestZapProof?.zapReceiptJson
        ) as Prisma.InputJsonValue | undefined
        const updated = await tx.purchase.update({
          where: { id: existingPurchase.id },
          data: {
            amountPaid: updatedAmount,
            // Preserve existing snapshot, but fill it if missing
            priceAtPurchase:
              existingPurchase.priceAtPurchase !== null && existingPurchase.priceAtPurchase !== undefined && existingPurchase.priceAtPurchase > 0
                ? existingPurchase.priceAtPurchase
                : priceSats,
            paymentType: resolvedPaymentType,
            zapReceiptId: existingPurchase.zapReceiptId ?? verifiedZapReceiptId,
            invoice: verifiedInvoice ?? existingPurchase.invoice,
            // Persist the exact artifacts we validated to avoid future relay fetches.
            zapReceiptJson: mergedZapReceipts,
            zapRequestJson: zapRequestJsonInput
          }
        })

        return {
          success: true,
          data: {
            purchase: updated,
            created: false,
            alreadyOwned: true,
            amountCredited: updatedAmount,
            priceSats,
            zapTotalSats
          }
        }
      }

      const createdZapReceiptJson = requestZapProof?.zapReceiptJson as Prisma.InputJsonValue | undefined
      const createdZapRequestJson = requestZapProof?.zapRequestJson as Prisma.InputJsonValue | undefined

      const created = await tx.purchase.create({
        data: {
          userId: session.user.id,
          courseId: courseId ?? null,
          resourceId: resourceId ?? null,
          // Only trust server-verified zap values; sum all verified receipts we processed in this call.
          amountPaid: verifiedAmountSats,
          // Snapshot the resolved price at claim time to avoid future price drifts affecting access
          priceAtPurchase: priceSats,
          paymentType: resolvedPaymentType,
          zapReceiptId: verifiedZapReceiptId,
          invoice: verifiedInvoice,
          // Store proof of payment alongside the purchase for offline audits.
          zapReceiptJson: createdZapReceiptJson,
          zapRequestJson: createdZapRequestJson
        }
      })

      return {
        success: true,
        data: {
          purchase: created,
          created: true,
          alreadyOwned: false,
          amountCredited: created.amountPaid,
          priceSats,
          zapTotalSats
        }
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })

    // Handle transaction result
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    // Audit log admin claim after successful transaction commit
    if (isAdminClaim) {
      auditLog(
        session.user.id,
        'purchase.admin_claim',
        {
          contentId: resourceId || courseId,
          contentType: resourceId ? 'resource' : 'course',
          paymentType,
          amountPaid: result.data.amountCredited,
          reason: adminReason
        },
        request
      )
    }

    // Audit log successful purchase claim
    auditLog(session.user.id, 'purchase.claim', {
      resourceId: resourceId ?? null,
      courseId: courseId ?? null,
      amountPaid: result.data.amountCredited,
      priceSats: result.data.priceSats,
      paymentType,
      created: result.data.created
    }, request)

    return NextResponse.json(result)
  } catch (error) {
    // Log full error server-side but return generic message to client
    // This prevents leaking implementation details through error messages
    console.error("Failed to claim purchase:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })

    // Audit log failed purchase claim (only if session is available)
    if (session?.user?.id) {
      auditLog(session.user.id, 'purchase.claim.failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, request)
    }

    // Handle common Prisma FK/unique errors gracefully (these are safe to expose)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Related content not found.' }, { status: 404 })
      }
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'Purchase already exists.' }, { status: 409 })
      }
    }

    // Return generic error message to avoid leaking implementation details
    return NextResponse.json({ error: 'Failed to claim purchase. Please try again.' }, { status: 500 })
  }
}
