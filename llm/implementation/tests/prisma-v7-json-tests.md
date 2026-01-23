# prisma-v7-json.test.ts

**Location**: `src/lib/tests/prisma-v7-json.test.ts`
**Tests**: 16

## Purpose

Validates that AdditionalLinks utilities remain compatible with Prisma v7 JSON types (`Prisma.JsonArray`, `Prisma.JsonObject`, `Prisma.InputJsonValue`). These tests are type-compatibility focused and do not require a database.

## Test Suites

### normalizeAdditionalLinks

| Test | Scenario | Expected |
|------|----------|----------|
| JsonArray compatibility | Normalized output | Castable to `Prisma.JsonArray` |
| Empty input | `undefined` / `null` | Returns empty array |
| Malformed JSON | Mixed entries | Filters/normalizes to valid links |
| Deduplication | Duplicate URLs | First instance wins |

### normalizeAdditionalLink

| Test | Scenario | Expected |
|------|----------|----------|
| String URL | `"https://example.com"` | Normalized link object |
| URL + title | Object input | Preserves title |
| Legacy formats | `href` / `link` | Maps to `url` |
| Dangerous URLs | `javascript:` / `data:` | Returns `null` |
| Bare domains | `example.com` | Prepends `https://` |
| Non-HTTP protocols | `mailto:` / `nostr:` | Preserved |

### JSON Type Compatibility

| Test | Scenario | Expected |
|------|----------|----------|
| InputJsonValue | Normalized links | Castable for writes |
| JsonArray round-trip | `JsonArray` -> normalize | Returns original normalized links |
| JsonObject input | `{ url, title }` | Normalizes to link object |

### Nostr Tag Conversion

| Test | Scenario | Expected |
|------|----------|----------|
| Links to tags | AdditionalLinks -> Nostr tags | Correct `r` tag format |
| Tags to links | Nostr tags -> links | Filters `r` tags only |
| Round-trip | Links -> tags -> links | Restores original links |
