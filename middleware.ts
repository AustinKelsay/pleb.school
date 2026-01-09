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
import nostrConfig from './config/nostr.json'

interface NostrConfig {
  relays?: Record<string, string[]>
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Add CSP header for enhanced security
  const isDevelopment = process.env.NODE_ENV === 'development'

  // In development, allow unsafe directives for Turbopack hot reloading
  // In production, remove unsafe directives for better security
  const scriptSrc = isDevelopment
    ? "'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live"
    : "'self' https://vercel.live"

  // Build connect-src from configured relays plus required analytics endpoints
  const relaySets = (nostrConfig as NostrConfig)?.relays ?? {}
  const relayList = new Set<string>(
    [
      ...(relaySets.default ?? []),
      ...(relaySets.content ?? []),
      ...(relaySets.profile ?? []),
      ...(relaySets.zapThreads ?? []),
      ...(relaySets.custom ?? []),
      ...(process.env.ALLOWED_RELAYS ? process.env.ALLOWED_RELAYS.split(',').map(r => r.trim()) : []),
    ].filter(Boolean)
  )

  // Fallback to current known-good relays if config/environment is empty
  if (relayList.size === 0) {
    ;['wss://relay.nostr.band', 'wss://nos.lol', 'wss://relay.damus.io'].forEach((r) => relayList.add(r))
  }

  const connectSrc = [
    "'self'",
    'https://vitals.vercel-insights.com',
    ...Array.from(relayList),
  ].join(' ')

  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline';
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
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Configure CORS based on environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'] // Development defaults

    const origin = request.headers.get('origin')
    // Only allow explicitly configured origins - no bypass for missing origin header
    const isAllowedOrigin = origin && allowedOrigins.includes(origin)

    if (isAllowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200 })
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
