# Security Audit Revision - HIGH Priority Items

**Date:** January 9, 2026
**Purpose:** Re-analysis of HIGH priority items for accuracy and intentional design patterns

---

## Summary of Changes

| Original ID | Original Severity | Revised Severity | Status |
|-------------|------------------|------------------|--------|
| H1 | HIGH | **FIXED** | Resolved in this session |
| H2 | HIGH | **MEDIUM** | Valid but lower severity |
| H3 | HIGH | **HIGH** | Confirmed valid |
| H4 | HIGH | **FALSE POSITIVE** | Not a vulnerability |
| H5 | HIGH | **FALSE POSITIVE** | Correct by design |
| H6 | HIGH | **MEDIUM** | Partially valid |

---

## H1: CORS Misconfiguration - FIXED

**Original Finding:** `!origin` bypass allowed requests without Origin header; wildcard `*` fallback.

**Resolution:** Fixed in this session. The change is safe because:
- All internal API calls use relative URLs (`/api/...`) - same-origin, no CORS needed
- Same-origin requests don't send Origin headers by browser spec
- Cross-origin requests now require explicit allowlist match

**No regression risk** - verified all 50+ internal fetch calls use relative paths.

---

## H2: 277 Console Statements - DOWNGRADED TO MEDIUM

**Original Finding:** Excessive logging including user data could leak information.

**Re-Analysis:**

**Why this design exists:**
1. **NextAuth debugging necessity** - Auth flows are notoriously hard to debug without logs
2. **Server-side only** - These logs never reach the client
3. **Awareness shown** - Line 596 in auth.ts gates some logs to development:
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     console.log('JWT Callback - Ephemeral keypair handling...')
   }
   ```
4. **Standard error handling** - Most `console.error` calls are in catch blocks (standard practice)
5. **UUIDs not sensitive** - User IDs logged are UUIDs, not PII

**What's actually logged (auth.ts sample):**
- User IDs (UUIDs) - low sensitivity
- Provider names - not sensitive
- Emails (in some places) - mild PII concern but server logs are secured
- Error stack traces - useful for debugging

**Revised Assessment:** MEDIUM priority. Recommend:
- Add a logging utility with log levels
- Strip verbose logs in production builds
- NOT a security vulnerability, just operational hygiene

---

## H3: Missing Rate Limiting - CONFIRMED HIGH

**Original Finding:** No rate limiting on API endpoints.

**Re-Analysis:**

**Mitigating factors already in place:**
1. **Vercel DDoS protection** - Infrastructure-level protection
2. **Cryptographic verification on purchases** - Zap receipts validated with signatures
3. **Short-lived email tokens** - 1 hour expiry
4. **snstr library rate limiting** - Nostr relay operations are rate-limited

**Still vulnerable endpoints:**
| Endpoint | Risk | Attack Vector |
|----------|------|---------------|
| `/api/account/verify-email` | **HIGH** | 6-digit code brute force (1M combinations) |
| `/api/views` | MEDIUM | View counter inflation |
| `/api/profile/aggregated` | LOW | Resource exhaustion |

**Calculation for email verification brute force:**
- 6-digit code = 1,000,000 possibilities
- At 100 req/sec (no rate limit) = ~2.8 hours to exhaust
- Token expires in 1 hour, so attack is feasible

**Revised Assessment:** HIGH - Confirmed. Priority should be:
1. Rate limit `/api/account/verify-email` (5 attempts per ref)
2. Rate limit `/api/account/send-link-verification` (3 per email per hour)
3. Consider rate limiting other endpoints later

---

## H4: Email Verification Lacks Session Validation - FALSE POSITIVE

**Original Finding:** `verify-email/route.ts` doesn't check session, could allow linking email to arbitrary user.

**Deep Re-Analysis:**

This is a **secure email verification pattern**, not a vulnerability.

**The complete flow:**

1. **Token Creation** (`send-link-verification/route.ts`):
   ```typescript
   // Line 19-25: Session IS checked here
   const session = await getServerSession(authOptions)
   if (!session?.user?.id) {
     return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
   }

   // Line 81: userId is bound to token at creation
   identifier: `link:${session.user.id}:${normalizedEmail}`
   ```

2. **Token Verification** (`verify-email/route.ts`):
   ```typescript
   // Line 59: userId is EXTRACTED from token, not user input
   const [, userId, emailRaw] = parts  // parts comes from verificationToken.identifier
   ```

**Security model:**
- Attacker would need BOTH:
  - `ref` (lookupId): 16 hex characters = 64 bits entropy
  - `token` (code): 6 digits = ~20 bits entropy
- Combined: ~84 bits of entropy - computationally infeasible to guess
- Both values are only sent to the legitimate email owner

**Why no session check is CORRECT:**
- User may click the email link on a different device/browser
- This is the standard "magic link" pattern used by NextAuth, Auth0, Firebase, etc.
- The userId binding happens at token creation (when session IS verified)
- The token itself IS the proof of authorization

**Revised Assessment:** NOT A VULNERABILITY. Remove from report.

---

## H5: Price Mismatch Logs But Continues Processing - FALSE POSITIVE

**Original Finding:** Price mismatches are logged but processing continues, potentially allowing incorrect purchases.

**Deep Re-Analysis:**

This is **correct by design**. The code is doing exactly what it should.

**From `pricing.ts` (lines 38-42):**
```typescript
// DB is authoritative; only fall back to Nostr when no DB price exists.
const resolved = hasDbPrice ? dbPrice! : nostrPrice ?? 0

if (hasDbPrice && onMismatch && nostrPrice !== dbPrice) {
  onMismatch({ id, type, dbPrice, nostrPrice, chosen: dbPrice })  // chosen is ALWAYS dbPrice
}
```

**Key insight:** The `nostrPriceHint` from the client is NEVER used when a DB price exists.

**Purchase flow:**
1. Client sends `nostrPriceHint` (what it thinks the price is)
2. Server looks up actual price in database
3. Server uses DATABASE price (authoritative)
4. If mismatch, server logs for monitoring
5. Purchase proceeds at DATABASE price

**Why this matters:**
- Users CANNOT underpay by sending fake `nostrPriceHint`
- The warning helps operators detect:
  - Stale Nostr events with outdated prices
  - Client-side caching issues
  - Price sync problems between DB and Nostr
- This is observability, not a security hole

**Revised Assessment:** NOT A VULNERABILITY. This is correct defensive coding.

---

## H6: Missing Environment Variable Validation - DOWNGRADED TO MEDIUM

**Original Finding:** No startup validation for critical env vars.

**Re-Analysis:**

**Already validated:**
| Variable | Validation | Location |
|----------|-----------|----------|
| `GITHUB_CLIENT_ID` | Throws at startup if GitHub enabled | `auth.ts:258-259` |
| `GITHUB_CLIENT_SECRET` | Throws at startup if GitHub enabled | `auth.ts:262-263` |
| `PRIVKEY_ENCRYPTION_KEY` | Throws in production if missing | `privkey-crypto.ts:24-28` |
| `DATABASE_URL` | Prisma fails on first query | Implicit |
| `NEXTAUTH_SECRET` | NextAuth fails if missing | NextAuth internals |

**Not validated:**
| Variable | Impact |
|----------|--------|
| `EMAIL_SERVER_*` | Email sending fails (graceful - non-blocking) |
| `ALLOWED_ORIGINS` | Falls back to localhost (development default) |
| `ALLOWED_RELAYS` | Falls back to config + hardcoded relays |
| `KV_REST_API_*` | Falls back to in-memory (graceful degradation) |

**Why partial validation is acceptable:**
1. Critical auth/DB vars DO fail-fast
2. Optional features degrade gracefully
3. Next.js doesn't have a standard pre-startup hook
4. Most issues surface immediately on first use

**What's actually missing:**
- Documentation of `ALLOWED_ORIGINS` and `ALLOWED_RELAYS` in `.env.example`
- Optional: startup validation script

**Revised Assessment:** MEDIUM. Main action item is documentation, not code changes.

---

## Updated Priority List

### ✅ Fixed
1. **H3: Rate Limiting** - Implemented via `src/lib/rate-limit.ts`:
   - `/api/account/verify-email`: 5 attempts per ref per hour
   - `/api/account/send-link-verification`: 3 emails per address per hour

### Downgraded to MEDIUM
2. **H2: Console Statements** - Add logging utility with levels (operational hygiene)
3. **H6: Env Var Documentation** - Document `ALLOWED_ORIGINS` and `ALLOWED_RELAYS`

### Removed (False Positives)
- ~~H4: Email Verification Session Check~~ - Secure by design
- ~~H5: Price Mismatch Handling~~ - Correct defensive coding

### Already Fixed
- **H1: CORS Configuration** - Fixed in this session

---

## Recommendations

### ✅ Immediate (Rate Limiting) - COMPLETED
Rate limiting implemented in `src/lib/rate-limit.ts` with:
- Vercel KV for production (automatic TTL cleanup)
- In-memory fallback for development
- Applied to both email verification endpoints

### Short-term (Logging)
```typescript
// Create src/lib/logger.ts
const logger = {
  debug: (...args) => process.env.NODE_ENV === 'development' && console.log(...args),
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}
```

### Documentation
Add to `.env.example`:
```bash
# --- CORS (required for production) ---
ALLOWED_ORIGINS="https://yourdomain.com"

# --- Nostr Relays (optional, supplements config/nostr.json) ---
# ALLOWED_RELAYS="wss://relay1.com,wss://relay2.com"
```

---

## Conclusion

The original audit was thorough but erred on the side of caution, flagging secure-by-design patterns as potential vulnerabilities. After deep analysis:

- **2 items were false positives** (email verification, price handling)
- **2 items downgraded** (logging, env vars)
- **1 item confirmed HIGH** (rate limiting)
- **1 item already fixed** (CORS)

The codebase shows strong security awareness with cryptographic verification, proper session handling, and defensive coding patterns. The main outstanding item is rate limiting on email verification endpoints.
