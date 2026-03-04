"use client"

import createDOMPurify from "dompurify"

const ALLOWED_TAGS = [
  "div", "span", "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "code", "pre", "blockquote",
  "a", "img", "iframe", "video", "source", "audio",
  "table", "thead", "tbody", "tr", "th", "td",
] as const

const ALLOWED_ATTR = [
  "class", "id",
  "href", "rel",
  "src", "alt", "title", "width", "height",
  "controls",
  "frameborder", "allowfullscreen", "allow", "loading",
  "colspan", "rowspan",
] as const

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

const ALLOWED_TAGS_SET = new Set<string>(ALLOWED_TAGS)
const ALLOWED_ATTR_SET = new Set<string>(ALLOWED_ATTR)
const BLOCKED_URI_SCHEMES = /^(?:javascript|vbscript|data):/i
const URI_OBFUSCATION_CHARS = /[\u0000-\u001F\u007F\s]+/g

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  colon: ":",
  tab: "\t",
  newline: "\n",
}

let domPurifyInstance: ReturnType<typeof createDOMPurify> | null = null

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);?/gi, (entity, bodyRaw) => {
    const body = String(bodyRaw).toLowerCase()

    if (body.startsWith("#x")) {
      const codePoint = Number.parseInt(body.slice(2), 16)
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        return String.fromCodePoint(codePoint)
      }
      return entity
    }

    if (body.startsWith("#")) {
      const codePoint = Number.parseInt(body.slice(1), 10)
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        return String.fromCodePoint(codePoint)
      }
      return entity
    }

    return NAMED_HTML_ENTITIES[body] ?? entity
  })
}

function normalizeUriForValidation(value: string): string {
  return decodeHtmlEntities(value).trim()
}

function escapeHtmlTextSegment(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function getSanitizedUri(value: string): string | null {
  const normalized = normalizeUriForValidation(value)
  if (!normalized) {
    return null
  }

  const collapsedForScheme = normalized.replace(URI_OBFUSCATION_CHARS, "")
  if (BLOCKED_URI_SCHEMES.test(collapsedForScheme)) {
    return null
  }

  if (!ALLOWED_URI_REGEXP.test(normalized)) {
    return null
  }

  return normalized
}

function getDomPurifyInstance() {
  if (typeof window === "undefined") {
    return null
  }

  if (!domPurifyInstance) {
    domPurifyInstance = createDOMPurify(window)
  }

  return domPurifyInstance
}

function sanitizeOnServer(content: string): string {
  if (!content) {
    return ""
  }

  // Strip script blocks first so their contents are always removed.
  const withoutScripts = content.replace(/<script\b[\s\S]*?<\/script>/gi, "")
  const tagPattern = /<\/?([a-z0-9-]+)\b([^>]*)>/gi
  let lastIndex = 0
  let sanitized = ""

  for (const match of withoutScripts.matchAll(tagPattern)) {
    const fullTag = match[0]
    const tagNameRaw = match[1] ?? ""
    const attrsRaw = match[2] ?? ""
    const matchIndex = match.index ?? 0

    sanitized += escapeHtmlTextSegment(withoutScripts.slice(lastIndex, matchIndex))
    lastIndex = matchIndex + fullTag.length

    const tagName = String(tagNameRaw).toLowerCase()
    if (!ALLOWED_TAGS_SET.has(tagName)) {
      continue
    }

    const isClosingTag = fullTag.startsWith("</")
    if (isClosingTag) {
      sanitized += `</${tagName}>`
      continue
    }

    const keptAttrs: string[] = []
    const attrs = String(attrsRaw)
    const attrPattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

    for (const attrMatch of attrs.matchAll(attrPattern)) {
      const attrName = String(attrMatch[1] ?? "").toLowerCase()
      if (!attrName || attrName.startsWith("on") || !ALLOWED_ATTR_SET.has(attrName)) {
        continue
      }

      const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4]
      const sanitizedUri = (attrName === "href" || attrName === "src") && rawValue
        ? getSanitizedUri(rawValue)
        : null
      if ((attrName === "href" || attrName === "src") && !sanitizedUri) {
        continue
      }

      if (rawValue === undefined) {
        keptAttrs.push(` ${attrName}`)
      } else {
        const normalizedValue = sanitizedUri ?? rawValue
        const escapedValue = normalizedValue.replace(/"/g, "&quot;")
        keptAttrs.push(` ${attrName}="${escapedValue}"`)
      }
    }

    sanitized += `<${tagName}${keptAttrs.join("")}>`
  }

  sanitized += escapeHtmlTextSegment(withoutScripts.slice(lastIndex))

  return sanitized
}

/**
 * Sanitize rich HTML content for safe rendering in client components.
 */
export function sanitizeRichContent(content: string): string {
  const domPurify = getDomPurifyInstance()
  if (!domPurify) {
    return sanitizeOnServer(content)
  }

  return domPurify.sanitize(content, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
  })
}
