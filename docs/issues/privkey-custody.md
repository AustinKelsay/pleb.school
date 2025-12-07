# Issue: custodial privkey storage/sharing for OAuth/anonymous accounts

## Summary
We intentionally mint **ephemeral bridging keypairs** for OAuth-first and anonymous users so they can speak Nostr until they “bring their own key.” Nostr-first users never share their privkey (per the referenced design docs). The issue is that we currently persist these ephemeral privkeys in plaintext (`User.privkey`), embed them in JWT/session payloads, and render them in UI—so even though the keys are low-value and meant to be temporary, they are trivially exfiltrated (DB leak, XSS, devtools, copy button).

## Why this is still risky (even for “low-value” bridging keys)
- Forged Nostr events tied to the user’s account erode trust and can push bad content under their identity.
- If we ever sign zaps/purchases server-side, a stolen key could claim or redirect payments.
- JWT/session exposure means the key can leak via logs, browser devtools, or any XSS.
- Keys persist indefinitely (no rotation/expiry), so compromise is long-lived.

## Current surface (non-exhaustive)
- Generation + storage: `src/lib/auth.ts` (createUser + signIn flows), `User.privkey` in `prisma/schema.prisma`.
- Session/JWT propagation: `src/lib/auth.ts` callbacks add `privkey` to tokens and sessions.
- UI exposure: `src/app/profile/components/profile-display.tsx` and `enhanced-profile-display.tsx` show/copy the privkey.
- Republish/publish paths: several APIs accept `privkey` for server-side signing and may reuse DB-stored keys.

## Minimal, practical improvement (low churn)
**Encrypt privkeys at rest and only decrypt server-side for authenticated requests.** This is the quickest win that blocks raw-DB-dump theft and keeps the key off disk in plaintext.

How to do it:
- Encrypt `User.privkey` with a server-held key (ideally KMS-managed; minimally an env secret).
- On privileged server actions that need the custodial key, decrypt in-memory and use it; never return the raw key to the client.
- Keep decryption and signing inside a narrow helper so logs and errors can’t leak the key.

Residual risks (why encryption alone isn’t a silver bullet):
- If the app still ever sends the decrypted key to the browser, XSS/devtools can grab it.
- If the server process or env secret is compromised, an attacker can decrypt.
- Runtime memory leaks or verbose logging could still expose the key material.

Lightweight add-ons that stay compatible with this approach:
- **Do not send privkey to the client at all** (prefer signing on the server; NIP-07 for user-held keys).
- **Gate signing endpoints** with auth + rate limit, and return only signed payloads, not the key.
- **Rotate the encryption key** (and re-encrypt stored privkeys) on a schedule or after incidents.

## Longer-term direction (unchanged)
1) Move to bring-your-own-key as the happy path and retire custodial keys where possible.
2) If custodial signing remains, keep keys server-side only (HSM/KMS or in-memory) and expose narrow signing endpoints instead of raw keys.
3) Migrate existing rows to null/rotate and update flows accordingly.

## Minimal rollout plan (incremental)
- Default `EXPOSE_SESSION_PRIVKEY=false` and strip `privkey` from JWT/session.
- Comment out/remove profile privkey display/copy buttons.
- Add simple AES encryption for `User.privkey` at rest (server key), then plan rotation.
- Rotate temp keys on login; clear on sign-out.
- Update auth UX copy to say: “Temporary platform key is for convenience—bring your own Nostr key to make it permanent.”
