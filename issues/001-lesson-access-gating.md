# Issue: Lesson pages bypass purchase gating

- **Location**: `src/app/courses/[id]/lessons/[lessonId]/details/page.tsx` sets `resourcePurchased = true` (around line 222) and uses a mock content block (around line 310) instead of fetched, access-checked content.
- **Impact**: Any visitor who can reach a lesson detail route sees paid content as if purchased. The API path `src/app/api/lessons/[id]/route.ts` also returns lesson/resource metadata without verifying ownership, making it easy to pair with Nostr notes client-side.
- **Risk**: Revenue leakage, ToS violations, and inconsistent UX (UI may show “Premium” badge but content is unlocked).
- **Recommended fix**:
  1. Move purchase checks server-side: require auth and validate ownership/course unlock before returning resource/lesson data in `/api/lessons/[id]` (mirror logic from `/api/resources/[id]`).
  2. On the client, derive `resourcePurchased` from the API response instead of forcing `true`; render a paywall component when locked.
  3. Replace the `mockResourceContent` fallback with real note content; if locked, avoid rendering note content entirely.
  4. Add regression coverage: a smoke test that requests a paid lesson as an anonymous user and asserts 401/403 plus UI paywall.

