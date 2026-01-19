/**
 * OAuth State Security Module
 *
 * Provides cryptographic signing and verification for OAuth state parameters
 * to prevent CSRF attacks on account linking flows.
 *
 * Security measures:
 * - HMAC-SHA256 signature prevents state forgery
 * - Timestamp prevents replay attacks (states expire after 10 minutes)
 * - Random nonce adds entropy and prevents predictability
 */

import crypto from 'crypto'
import { z } from 'zod'

/**
 * Maximum age for OAuth state (10 minutes in milliseconds)
 * After this time, the state is considered expired
 */
const STATE_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Get the signing key for OAuth state
 * Uses NEXTAUTH_SECRET as the base key (always required for NextAuth)
 */
function getSigningKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for OAuth state signing')
  }
  // Derive a specific key for OAuth state signing
  return crypto.createHash('sha256').update(`oauth-state:${secret}`).digest()
}

/**
 * Schema for the signed OAuth state payload
 */
const SignedStateSchema = z.object({
  userId: z.string().min(1).max(128),
  action: z.literal('link'),
  provider: z.literal('github'),
  timestamp: z.number().int().positive(),
  nonce: z.string().length(32), // 16 bytes as hex
  sig: z.string().length(64)    // 32 bytes HMAC as hex
}).strict()

export type SignedStatePayload = z.infer<typeof SignedStateSchema>

/**
 * Data needed to create a signed state
 */
export interface OAuthStateData {
  userId: string
  action: 'link'
  provider: 'github'
}

/**
 * Create a cryptographically signed OAuth state parameter
 *
 * The state includes:
 * - userId, action, provider: The actual state data
 * - timestamp: When the state was created (for expiry)
 * - nonce: Random value for unpredictability
 * - sig: HMAC-SHA256 signature of all above fields
 */
export function createSignedState(data: OAuthStateData): string {
  const timestamp = Date.now()
  const nonce = crypto.randomBytes(16).toString('hex')

  const payload = {
    userId: data.userId,
    action: data.action,
    provider: data.provider,
    timestamp,
    nonce
  }

  // Create signature over the payload (without sig field)
  const signatureData = JSON.stringify(payload)
  const sig = crypto
    .createHmac('sha256', getSigningKey())
    .update(signatureData)
    .digest('hex')

  const signedPayload = { ...payload, sig }

  return Buffer.from(JSON.stringify(signedPayload)).toString('base64')
}

/**
 * Normalize base64/base64url input to standard base64
 */
function normalizeBase64(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4
  if (pad === 2) normalized += '=='
  else if (pad === 3) normalized += '='
  return normalized
}

/**
 * Verification result
 */
export type StateVerificationResult =
  | { valid: true; data: OAuthStateData }
  | { valid: false; error: string }

/**
 * Verify and decode a signed OAuth state parameter
 *
 * Checks:
 * 1. State is valid base64 JSON
 * 2. State matches expected schema
 * 3. Signature is valid (state wasn't forged)
 * 4. State hasn't expired (within 10 minutes)
 */
export function verifySignedState(stateParam: string): StateVerificationResult {
  // Basic validation
  if (!stateParam || typeof stateParam !== 'string') {
    return { valid: false, error: 'Missing state parameter' }
  }

  if (stateParam.length > 4096) {
    return { valid: false, error: 'State parameter too large' }
  }

  // Decode base64
  let decoded: unknown
  try {
    const normalized = normalizeBase64(stateParam)
    const buffer = Buffer.from(normalized, 'base64')
    decoded = JSON.parse(buffer.toString('utf8'))
  } catch {
    return { valid: false, error: 'Invalid state encoding' }
  }

  // Validate schema
  const parseResult = SignedStateSchema.safeParse(decoded)
  if (!parseResult.success) {
    return { valid: false, error: 'Invalid state format' }
  }

  const { userId, action, provider, timestamp, nonce, sig } = parseResult.data

  // Verify signature
  const payload = { userId, action, provider, timestamp, nonce }
  const signatureData = JSON.stringify(payload)
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(signatureData)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { valid: false, error: 'Invalid state signature' }
  }

  // Check expiry
  const age = Date.now() - timestamp
  if (age > STATE_MAX_AGE_MS) {
    return { valid: false, error: 'State has expired' }
  }

  // Also reject states from the future (clock skew tolerance: 1 minute)
  if (age < -60000) {
    return { valid: false, error: 'Invalid state timestamp' }
  }

  return {
    valid: true,
    data: { userId, action, provider }
  }
}
