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
  "sandbox", "loading",
  "colspan", "rowspan",
] as const

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

const ALLOWED_TAGS_SET = new Set<string>(ALLOWED_TAGS)
const ALLOWED_ATTR_SET = new Set<string>(ALLOWED_ATTR)
const BLOCKED_URI_SCHEMES = /^(?:javascript|vbscript|data):/i
const URI_OBFUSCATION_CHARS = /[\x00-\x1F\x7F\s]+/g
const IFRAME_SANDBOX_VALUE = "allow-scripts allow-same-origin allow-presentation"
const IFRAME_DISALLOWED_ATTRS = new Set(["allow", "allowfullscreen", "frameborder", "srcdoc"])

let domPurifyHooksInitialized = false

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

function isAllowedIframeHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "youtube.com" ||
    normalized.endsWith(".youtube.com") ||
    normalized === "youtube-nocookie.com" ||
    normalized.endsWith(".youtube-nocookie.com") ||
    normalized === "youtu.be" ||
    normalized.endsWith(".youtu.be") ||
    normalized === "vimeo.com" ||
    normalized.endsWith(".vimeo.com")
  )
}

function isAllowedIframeSrc(value: string): boolean {
  const normalized = normalizeUriForValidation(value)
  if (!normalized) {
    return false
  }

  // Reject protocol-relative URLs (e.g. //evil.example.com/embed) so host allowlists still apply.
  if (normalized.startsWith("//")) {
    return false
  }

  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return true
  }

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false
    }

    if (typeof window !== "undefined") {
      const currentHost = window.location.hostname.toLowerCase()
      if (parsed.hostname.toLowerCase() === currentHost) {
        return true
      }
    }

    return isAllowedIframeHost(parsed.hostname)
  } catch {
    return false
  }
}

function configureDomPurify(instance: ReturnType<typeof createDOMPurify>) {
  if (domPurifyHooksInitialized) {
    return
  }

  instance.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element) || node.tagName.toLowerCase() !== "iframe") {
      return
    }

    IFRAME_DISALLOWED_ATTRS.forEach((attr) => {
      node.removeAttribute(attr)
    })

    const src = node.getAttribute("src")
    const sanitizedSrc = src ? getSanitizedUri(src) : null
    if (!sanitizedSrc || !isAllowedIframeSrc(sanitizedSrc)) {
      node.removeAttribute("src")
    } else {
      node.setAttribute("src", sanitizedSrc)
    }

    node.setAttribute("sandbox", IFRAME_SANDBOX_VALUE)
    if (!node.getAttribute("loading")) {
      node.setAttribute("loading", "lazy")
    }
  })

  domPurifyHooksInitialized = true
}

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
  configureDomPurify(domPurifyInstance)

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
    const isIframe = tagName === "iframe"
    let hasIframeLoading = false

    for (const attrMatch of attrs.matchAll(attrPattern)) {
      const attrName = String(attrMatch[1] ?? "").toLowerCase()
      if (isIframe && IFRAME_DISALLOWED_ATTRS.has(attrName)) {
        continue
      }
      if (!attrName || attrName.startsWith("on") || !ALLOWED_ATTR_SET.has(attrName)) {
        continue
      }

      if (isIframe && attrName === "sandbox") {
        continue
      }

      const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4]
      const sanitizedUri = (attrName === "href" || attrName === "src") && rawValue
        ? getSanitizedUri(rawValue)
        : null
      if ((attrName === "href" || attrName === "src") && !sanitizedUri) {
        continue
      }
      if (isIframe && attrName === "src" && sanitizedUri && !isAllowedIframeSrc(sanitizedUri)) {
        continue
      }
      if (isIframe && attrName === "loading") {
        hasIframeLoading = true
      }

      if (rawValue === undefined) {
        keptAttrs.push(` ${attrName}`)
      } else {
        const normalizedValue = sanitizedUri ?? rawValue
        const escapedValue = normalizedValue.replace(/"/g, "&quot;")
        keptAttrs.push(` ${attrName}="${escapedValue}"`)
      }
    }

    if (isIframe) {
      keptAttrs.push(` sandbox="${IFRAME_SANDBOX_VALUE}"`)
      if (!hasIframeLoading) {
        keptAttrs.push(` loading="lazy"`)
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
