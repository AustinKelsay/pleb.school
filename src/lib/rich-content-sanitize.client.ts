"use client"

import DOMPurify from "isomorphic-dompurify"

/**
 * Sanitize rich HTML content for safe rendering in client components.
 */
export function sanitizeRichContent(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "div", "span", "p", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "strong", "em", "b", "i", "u", "s", "code", "pre", "blockquote",
      "a", "img", "iframe", "video", "source", "audio",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: [
      "class", "id",
      "href", "rel",
      "src", "alt", "title", "width", "height",
      "controls",
      "frameborder", "allowfullscreen", "allow", "loading",
      "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}
