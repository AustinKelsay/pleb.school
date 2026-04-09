/**
 * Next.js Middleware
 * 
 * This middleware handles:
 * - Security headers
 * - CORS for API routes
 * - Basic routing (NextAuth handles its own auth routes)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isRemoteFontLoadingEnabled } from './src/lib/font-loading-policy'
import { RELAY_ALLOWLIST } from './src/lib/nostr-relays'

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const DEFAULT_ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS'
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization'
const UNSAFE_CSP_SOURCE_CHARS = /[\s;'"`]/u
const ALLOWED_RELAY_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])

function parseAllowedOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS
}

function appendVary(response: NextResponse, value: string): void {
  const currentVary = response.headers.get('Vary')
  if (!currentVary) {
    response.headers.set('Vary', value)
    return
  }

  const existing = currentVary.split(',').map((item) => item.trim().toLowerCase())
  if (existing.includes(value.toLowerCase())) {
    return
  }

  response.headers.set('Vary', `${currentVary}, ${value}`)
}

function normalizeAllowedRelayOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || UNSAFE_CSP_SOURCE_CHARS.test(trimmed)) {
    return null
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `wss://${trimmed.replace(/^\/\//, '')}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  if (!ALLOWED_RELAY_PROTOCOLS.has(url.protocol)) {
    return null
  }

  if (!url.hostname || url.username || url.password) {
    return null
  }

  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    return null
  }

  const origin = url.origin
  return origin && origin !== 'null' && !UNSAFE_CSP_SOURCE_CHARS.test(origin) ? origin : null
}

function parseAllowedRelays(envValue?: string): string[] {
  if (!envValue) {
    return []
  }

  return envValue
    .split(',')
    .map((relay) => normalizeAllowedRelayOrigin(relay))
    .filter((relay): relay is string => Boolean(relay))
}

function applyCorsHeaders(request: NextRequest, response: NextResponse): void {
  const allowedOrigins = parseAllowedOrigins()
  const origin = request.headers.get('origin')

  const requestedHeaders = request.headers.get('access-control-request-headers')
  const allowHeaders = requestedHeaders && requestedHeaders.trim().length > 0
    ? requestedHeaders
    : DEFAULT_ALLOWED_HEADERS

  response.headers.set('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS)
  response.headers.set('Access-Control-Allow-Headers', allowHeaders)
  response.headers.set('Access-Control-Max-Age', '86400')

  // Ensure caches keep CORS variants separated by request headers/origin.
  appendVary(response, 'Origin')
  appendVary(response, 'Access-Control-Request-Method')
  appendVary(response, 'Access-Control-Request-Headers')

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  } else {
    response.headers.delete('Access-Control-Allow-Origin')
    response.headers.delete('Access-Control-Allow-Credentials')
  }
}

export function middleware(request: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const allowRemoteFonts = isRemoteFontLoadingEnabled(process.env)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
  const isApiPreflight = isApiRoute && request.method === 'OPTIONS'

  // Preflight requests must use the same response object that receives headers.
  const response = isApiPreflight
    ? new NextResponse(null, { status: 200 })
    : NextResponse.next()

  // Add security headers
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // HSTS: only in production to avoid caching issues on dev/staging domains
  if (!isDevelopment) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  // In development, allow unsafe directives for Turbopack hot reloading
  // In production, remove unsafe directives for better security
  const scriptSrc = isDevelopment
    ? "'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live"
    : "'self' https://vercel.live"
  const styleSrc = allowRemoteFonts
    ? "'self' 'unsafe-inline' https://fonts.googleapis.com"
    : "'self' 'unsafe-inline'"

  // Build connect-src from the shared relay allowlist plus any env extensions.
  const envRelays = parseAllowedRelays(process.env.ALLOWED_RELAYS)
  const relayList = new Set<string>(
    [
      ...RELAY_ALLOWLIST,
      ...envRelays,
    ].filter(Boolean)
  )

  const connectSrc = [
    "'self'",
    'https://vitals.vercel-insights.com',
    ...Array.from(relayList),
  ].join(' ')

  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src ${styleSrc};
    img-src 'self' blob: data: https://images.unsplash.com https://avatars.githubusercontent.com https://api.dicebear.com https://i.ytimg.com https://yt3.ggpht.com https://nyc3.digitaloceanspaces.com;
    font-src 'self' https://fonts.gstatic.com;
    connect-src ${connectSrc};
    media-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()
  
  response.headers.set('Content-Security-Policy', cspHeader)

  // Handle API routes with environment-aware CORS
  if (isApiRoute) {
    applyCorsHeaders(request, response)

    // Preflight responses are completed at middleware level.
    if (isApiPreflight) {
      return response
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|public/).*)',
  ],
} 
