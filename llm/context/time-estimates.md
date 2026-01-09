# Content Time Estimates

How video duration is stored and displayed across pleb.school.

## Overview

Video duration is manually entered by users and stored in Nostr event tags. Read time calculation for documents is not currently implemented.

## Video Duration

### Data Flow

```
Draft Form → Draft DB → Nostr Event Tag → UI Display
     ↓           ↓              ↓              ↓
  user input   duration    ["duration",     formatted
  "10 min"     String?      "10 min"]       display
```

### Draft Storage

**Prisma Schema** (`prisma/schema.prisma`):
```prisma
model Draft {
  // ... other fields
  videoUrl  String?
  duration  String?   // User-entered duration for videos
  // ...
}
```

**Service Layer** (`src/lib/draft-service.ts`):
```typescript
interface CreateDraftData {
  // ...
  videoUrl?: string
  duration?: string  // Only set for video type
  // ...
}
```

### Nostr Event Tag

When publishing, duration is added as a Nostr event tag (`src/lib/nostr-events.ts`):

```typescript
// In createResourceEvent() and createUnsignedResourceEvent()
if (draft.type === 'video' && draft.duration) {
  tags.push(['duration', draft.duration])
}
```

**Example published event tags:**
```json
[
  ["title", "My Video Tutorial"],
  ["video", "https://youtube.com/watch?v=..."],
  ["duration", "15 min"],
  ["t", "video"]
]
```

### Duration Formatting

Located in `src/app/content/components/resource-content-view.tsx`:

```typescript
function formatDurationLabel(rawDuration?: string | number | null): string | null {
  // Handles multiple input formats:
  // - Raw seconds (number): 120 → "2 min"
  // - Time string: "30 min" → "30 min"
  // - Clock format: "2:30" → "2m 30s"
  // - Passthrough: Unknown formats returned as-is
}
```

## UI Input

### Draft Creation Form

Located in `src/app/create/components/create-draft-form.tsx`:

The duration field only appears for video type content:

```tsx
{formData.type === 'video' && (
  <div className="space-y-2">
    <Label htmlFor="duration">
      Duration <span className="text-muted-foreground">(Optional)</span>
    </Label>
    <Input
      id="duration"
      type="text"
      placeholder="e.g., 10 min, 1h 30m, 45 min"
      value={formData.duration}
      onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
    />
    <p className="text-sm text-muted-foreground">
      How long is this video? Leave blank to show "medium" as default.
    </p>
  </div>
)}
```

## Fallback Behavior

When no duration is available, the UI displays `"medium"` as a generic fallback:

| Content Type | Has Duration | Display |
|--------------|--------------|---------|
| Video | Yes | User-entered duration |
| Video | No | "medium" |

### Fallback Locations

- `src/app/courses/[id]/page.tsx`: `lesson.duration || 'medium'`
- `src/app/courses/[id]/lessons/[lessonId]/details/page.tsx`: `content.duration || 'medium'`
- `src/app/drafts/drafts-client.tsx`: `draft.duration || 'medium'`
- `src/app/drafts/courses/[id]/publish/course-publish-client.tsx`: `lesson.duration || 'medium'`
- `src/components/homepage/videos-section.tsx`: Duration tag from Nostr or `'medium'`

## Type Definitions

### ResourceDraft (hooks/useAllDraftsQuery.ts)

```typescript
interface ResourceDraft {
  // ...
  duration?: string | null  // Video duration
  // ...
}
```

### ResolvedDraftLesson (lib/drafts/lesson-resolution.ts)

```typescript
interface ResolvedDraftLesson {
  // ...
  videoUrl?: string
  duration?: string  // Parsed from Nostr or draft
  // ...
}
```

### ResourceEventDraftInput (lib/nostr-events.ts)

```typescript
type ResourceEventDraftInput = {
  // ...
  videoUrl?: string | null
  duration?: string | null  // Added to Nostr event tags
}
```

## API Endpoints

### Create Draft
`POST /api/drafts/resources`

```typescript
const createDraftSchema = z.object({
  // ...
  videoUrl: z.string().url().optional(),
  duration: z.string().max(50, 'Duration too long').optional()
})
```

### Update Draft
`PUT /api/drafts/resources/[id]`

```typescript
const updateDraftSchema = z.object({
  // ...
  videoUrl: z.string().url().optional(),
  duration: z.string().max(50, 'Duration too long').optional()
})
```

## Future Considerations

### Auto-Detection (Not Implemented)

Video duration could potentially be auto-detected from certain sources:

| Source | Method | Complexity |
|--------|--------|------------|
| Vimeo | oEmbed API (free, no auth) | Easy |
| Direct video files | HTML5 video `loadedmetadata` event | Easy |
| YouTube | YouTube Data API v3 (requires API key) | Medium |
| Unknown sources | Not possible | N/A |

Current implementation uses manual entry with "medium" fallback for simplicity.
