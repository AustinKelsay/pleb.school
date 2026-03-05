# Fix Plan: Vercel `ERR_REQUIRE_ESM` on Course/Lesson Routes

## Scope
This document addresses the production runtime error:

- `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js from ... html-encoding-sniffer.js not supported`
- Observed on `GET /courses/.../lessons/.../details` with HTTP `200` responses.

## Why This Happens
The current sanitizer utility imports `isomorphic-dompurify`:

- `src/lib/rich-content-sanitize.client.ts`

`isomorphic-dompurify` pulls in `jsdom` on Node runtimes. In this dependency chain, `html-encoding-sniffer` (CJS) tries to `require()` `@exodus/bytes` (ESM), which throws on Vercel's Node runtime.

## Required Fixes

1. Replace `isomorphic-dompurify` usage in `src/lib/rich-content-sanitize.client.ts` with browser-side `dompurify` initialization.
2. Ensure Node/server runtime does not load `jsdom`/`html-encoding-sniffer` for this sanitizer path.
3. Add `dompurify` as a direct dependency and remove `isomorphic-dompurify` from direct dependencies.
4. Keep sanitization behavior consistent with current allowlist (`ALLOWED_TAGS`, `ALLOWED_ATTR`, URI restrictions).
5. Verify the sanitizer still strips:
   - `<script>` blocks
   - `javascript:`/`vbscript:`/`data:` URLs in `href`/`src`
   - unsafe event handler attributes
6. Harden server fallback URI validation against obfuscation:
   - reject leading-whitespace/control-char scheme tricks (e.g. `\n javascript:`)
   - decode entity-obfuscated schemes before protocol checks (e.g. `javascript&#58;`)
7. Harden server fallback HTML handling for malformed tags:
   - neutralize incomplete/unclosed tag fragments in plain-text segments
   - ensure malformed `<...` input is emitted as escaped text, not executable markup

## Files Expected To Change

- `src/lib/rich-content-sanitize.client.ts`
- `package.json`
- `package-lock.json`
- (optional) `src/lib/tests/rich-content-sanitize.client.test.ts` if behavior snapshots need updates

## Validation Checklist

Run locally:

```bash
npm run lint
npm run typecheck
npm run test -- src/lib/tests/rich-content-sanitize.client.test.ts
npm run build
```

Then deploy and verify:

1. Revisit pages that previously triggered the error (`/courses/.../lessons/.../details`).
2. In Vercel logs, filter by `level:error` for the same time window style used before.
3. Confirm no new `ERR_REQUIRE_ESM` entries referencing:
   - `html-encoding-sniffer`
   - `@exodus/bytes/encoding-lite.js`

## Rollback
If behavior regresses, revert only sanitizer/dependency changes and redeploy. Keep this fix isolated from unrelated analytics/UI changes.
