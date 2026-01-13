/**
 * Rate Limiting Utility
 *
 * Uses Vercel KV when available, falls back to in-memory store for development.
 * Implements sliding window rate limiting with configurable limits and TTL.
 */

import { kv } from "@vercel/kv"

const hasKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

// In-memory fallback for local development
const memoryStore = new Map<string, { count: number; resetAt: number }>()

type RateLimitResult = {
  success: boolean
  remaining: number
  resetIn: number // seconds until reset
}

/**
 * Check and increment rate limit counter
 *
 * @param key - Unique identifier for the rate limit (e.g., "verify-email:abc123")
 * @param limit - Maximum allowed requests in the window
 * @param windowSeconds - Time window in seconds
 * @returns Result with success status, remaining attempts, and reset time
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowKey = `ratelimit:${key}`

  if (hasKV) {
    return checkRateLimitKV(windowKey, limit, windowSeconds, now)
  }
  return checkRateLimitMemory(windowKey, limit, windowSeconds, now)
}

/**
 * Check rate limit using atomic Lua script
 * 
 * Uses a single Redis transaction to:
 * 1. Increment the counter
 * 2. Check TTL
 * 3. Set expiry if missing (handles both first request and recovery from failures)
 * 
 * This eliminates race conditions and ensures keys always have TTL set.
 */
async function checkRateLimitKV(
  key: string,
  limit: number,
  windowSeconds: number,
  now: number
): Promise<RateLimitResult> {
  try {
    // Atomic Lua script: INCR + conditional EXPIRE in single operation
    const result = await kv.eval(
      `
      local count = redis.call('INCR', KEYS[1])
      local ttl = redis.call('TTL', KEYS[1])
      
      -- Set expiry if missing (ttl < 0 means no TTL or key doesn't exist)
      -- Handles both first request AND recovery from failed expire calls
      if ttl < 0 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
        ttl = tonumber(ARGV[1])
      end
      
      return {count, ttl}
      `,
      [key], // KEYS array
      [windowSeconds.toString()] // ARGV array
    ) as [number, number]

    const [count, ttl] = result

    return {
      success: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn: ttl
    }
  } catch (error) {
    // Fail closed on KV errors (deny request)
    // This is critical for security-sensitive endpoints like email verification
    console.error('Rate limit check failed:', error)
    return {
      success: false,
      remaining: 0,
      resetIn: windowSeconds
    }
  }
}

function checkRateLimitMemory(
  key: string,
  limit: number,
  windowSeconds: number,
  now: number
): RateLimitResult {
  const existing = memoryStore.get(key)
  const resetAt = now + windowSeconds

  if (!existing || existing.resetAt <= now) {
    // Window expired or first request
    memoryStore.set(key, { count: 1, resetAt })
    return {
      success: true,
      remaining: limit - 1,
      resetIn: windowSeconds
    }
  }

  // Increment existing window
  existing.count++
  const resetIn = Math.max(0, existing.resetAt - now)

  return {
    success: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetIn
  }
}

/**
 * Extract client IP from request headers (for use in App Router context)
 *
 * Uses next/headers to access request headers. Returns 'unknown' if IP cannot be determined.
 * Handles X-Forwarded-For (first IP in chain) and X-Real-IP headers.
 */
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import('next/headers')
    const headerStore = await headers()

    // X-Forwarded-For may contain multiple IPs; take the first (original client)
    const forwardedFor = headerStore.get('x-forwarded-for')
    if (forwardedFor) {
      const firstIp = forwardedFor.split(',')[0]?.trim()
      if (firstIp) return firstIp
    }

    // Fallback to X-Real-IP
    const realIp = headerStore.get('x-real-ip')
    if (realIp) return realIp

    return 'unknown'
  } catch {
    // headers() may not be available in all contexts
    return 'unknown'
  }
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Email verification: 5 attempts per ref (prevents brute force on 6-digit code)
  EMAIL_VERIFY: { limit: 5, windowSeconds: 3600 }, // 5 attempts per hour per ref

  // Send verification email: 3 per email per hour (prevents spam)
  EMAIL_SEND: { limit: 3, windowSeconds: 3600 }, // 3 emails per hour per address

  // Auth magic link: 5 per email per 15 minutes (prevents email flooding)
  AUTH_MAGIC_LINK: { limit: 5, windowSeconds: 900 }, // 5 magic links per 15 min per email

  // Nostr auth: 10 attempts per pubkey per minute (prevents enumeration)
  AUTH_NOSTR: { limit: 10, windowSeconds: 60 }, // 10 attempts per minute per pubkey

  // Anonymous auth per-IP: 5 per IP per hour (prevents single-source abuse)
  AUTH_ANONYMOUS_PER_IP: { limit: 5, windowSeconds: 3600 },

  // Anonymous auth global: 50 per hour total (backstop for distributed attacks)
  AUTH_ANONYMOUS_GLOBAL: { limit: 50, windowSeconds: 3600 },

  // General API rate limit (can be used for other endpoints)
  API_GENERAL: { limit: 100, windowSeconds: 60 } // 100 requests per minute
} as const
