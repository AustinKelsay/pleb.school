# content-utils.test.ts

**Location**: `src/lib/tests/content-utils.test.ts`
**Tests**: ~25

## Purpose

Tests XSS sanitization and content extraction utilities.

## Functions Tested

### `sanitizeContent(content)`
Removes dangerous HTML while preserving safe formatting.

### `extractTextFromMarkdown(markdown)`
Extracts plain text from markdown for summaries/search.

### `sanitizeUrl(url)`
Validates and sanitizes URLs.

## XSS Sanitization Tests

### Script Injection

| Test | Input | Expected Output |
|------|-------|-----------------|
| Basic script | `<script>alert(1)</script>` | `` |
| Event handler | `<img onerror="alert(1)">` | `<img>` |
| javascript: URL | `<a href="javascript:alert(1)">` | `<a>` |
| data: URL | `<img src="data:text/html,...">` | `<img>` |
| SVG script | `<svg><script>alert(1)</script></svg>` | `<svg></svg>` |

### Preserved Elements

| Element | Preserved | Reason |
|---------|-----------|--------|
| `<p>`, `<div>` | Yes | Structure |
| `<a href="https://...">` | Yes | Safe links |
| `<img src="https://...">` | Yes | Safe images |
| `<code>`, `<pre>` | Yes | Code blocks |
| `<strong>`, `<em>` | Yes | Formatting |
| `<iframe>` | Yes | Safe embeds (YouTube/Vimeo) — only sanitized src/attrs allowed |
| `<object>` | No | Dangerous |
| `<embed>` | No | Dangerous |

### Attribute Sanitization

| Test | Input | Output |
|------|-------|--------|
| onclick | `<div onclick="...">` | `<div>` |
| onload | `<img onload="...">` | `<img>` |
| style (expression) | `<div style="expression(...)">` | `<div>` |
| data attributes | `<div data-x="y">` | `<div>` |

### Iframe Sanitization

| Test | Input | Output |
|------|-------|--------|
| Safe YouTube embed | `<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen>` | Preserved |
| Safe Vimeo embed | `<iframe src="https://player.vimeo.com/video/123456">` | Preserved |
| javascript: src | `<iframe src="javascript:alert(1)">` | `<iframe>` (src removed) |
| Allowed attributes | `frameborder`, `allowfullscreen`, `allow`, `loading` | Preserved |
| Dangerous attributes | `onload`, `onerror`, etc. | Removed |

## Markdown Extraction Tests

### Text Extraction

| Input | Output |
|-------|--------|
| `# Heading` | `Heading` |
| `**bold**` | `bold` |
| `[link](url)` | `link` |
| `` `code` `` | `code` |
| `> quote` | `quote` |

### Code Block Handling

| Test | Behavior |
|------|----------|
| Fenced blocks | Content preserved as text |
| Inline code | Backticks stripped |
| Language tags | Ignored |

## URL Sanitization Tests

### Allowed Schemes

| URL | Allowed |
|-----|---------|
| `https://example.com` | Yes |
| `http://example.com` | Yes |
| `//example.com` | Yes (protocol-relative) |
| `javascript:alert(1)` | No |
| `data:text/html,...` | No |
| `vbscript:...` | No |

### Encoding Attacks

| Test | Input | Blocked |
|------|-------|---------|
| Hex encoding | `&#x6A;avascript:` | Yes |
| Unicode | `\u006Aavascript:` | Yes |
| Mixed case | `JaVaScRiPt:` | Yes |
| Whitespace | `java script:` | Yes |

## Related Files

- `src/lib/content-utils.ts` - Implementation (`sanitizeContent` function with `ALLOWED_TAGS` and `ALLOWED_ATTR` constants; `ALLOWED_URI_REGEXP` enforces protocol restrictions)
- Components that render user content
- [security-patterns.md](../../context/security-patterns.md) - XSS overview
