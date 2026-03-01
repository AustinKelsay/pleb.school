import { describe, expect, it, vi } from "vitest"

// Mock dependencies before importing the module
vi.mock("@/lib/additional-links", () => ({
  tagsToAdditionalLinks: vi.fn(() => []),
}))

vi.mock("@/data/types", () => ({
  parseCourseEvent: vi.fn(),
  parseEvent: vi.fn(),
}))

import {
  sanitizeContent,
  extractPlainText,
  formatContentForDisplay,
  extractVideoBodyMarkdown,
  isLikelyEncryptedContent,
} from "../content-utils"

describe("sanitizeContent", () => {
  it("escapes script tags instead of rendering them", () => {
    const input = '<div>Hello</div><script>alert("xss")</script><p>World</p>'
    const result = sanitizeContent(input)
    expect(result).toContain("&lt;script&gt;")
    expect(result).toContain("alert(&quot;xss&quot;)")
  })

  it("escapes event handler payloads", () => {
    const input = '<img src=x onerror="alert(\'xss\')">'
    const result = sanitizeContent(input)
    expect(result).toContain("onerror=&quot;alert(&#39;xss&#39;)&quot;")
    expect(result).toContain("&lt;img")
  })

  it("escapes links and preserves text", () => {
    const input = '<a href="https://example.com">Visit site</a>'
    const result = sanitizeContent(input)
    expect(result).toContain("&lt;a")
    expect(result).toContain("Visit site")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeContent("")).toBe("")
  })
})

describe("extractPlainText", () => {
  it("removes HTML tags", () => {
    const input = "<div><p>Hello <strong>World</strong></p></div>"
    const result = extractPlainText(input)
    expect(result).toBe("Hello World")
  })

  it("removes markdown headers", () => {
    const input = "# Heading 1\n## Heading 2\nContent"
    const result = extractPlainText(input)
    expect(result).toBe("Heading 1\nHeading 2\nContent")
  })

  it("removes bold markdown", () => {
    const input = "This is **bold** text"
    const result = extractPlainText(input)
    expect(result).toBe("This is bold text")
  })

  it("removes italic markdown", () => {
    const input = "This is *italic* text"
    const result = extractPlainText(input)
    expect(result).toBe("This is italic text")
  })

  it("removes inline code", () => {
    const input = "Use `const x = 1` syntax"
    const result = extractPlainText(input)
    expect(result).toBe("Use const x = 1 syntax")
  })

  it("removes code blocks completely", () => {
    const input = "Text before\n```javascript\nconst x = 1;\n```\nText after"
    const result = extractPlainText(input)
    // Note: leaves blank line where code block was, which is fine
    expect(result).toBe("Text before\n\nText after")
    expect(result).not.toContain("```")
    expect(result).not.toContain("javascript")
    expect(result).not.toContain("const x = 1")
  })

  it("removes markdown links but keeps text", () => {
    const input = "Check [this link](https://example.com) out"
    const result = extractPlainText(input)
    expect(result).toBe("Check this link out")
  })

  it("removes markdown images but keeps alt text", () => {
    const input = "See ![alt text](https://example.com/image.png) here"
    const result = extractPlainText(input)
    expect(result).toBe("See alt text here")
  })
})

describe("formatContentForDisplay", () => {
  it("collapses multiple blank lines", () => {
    const input = "Line 1\n\n\n\nLine 2"
    const result = formatContentForDisplay(input)
    expect(result).toBe("Line 1\n\nLine 2")
  })

  it("trims leading and trailing whitespace", () => {
    const input = "  \n  Hello World  \n  "
    const result = formatContentForDisplay(input)
    expect(result).toBe("Hello World")
  })

  it("converts tabs to spaces", () => {
    const input = "Line\twith\ttabs"
    const result = formatContentForDisplay(input)
    expect(result).toBe("Line  with  tabs")
  })
})

describe("extractVideoBodyMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(extractVideoBodyMarkdown("")).toBe("")
  })

  it("returns empty string for null/undefined input", () => {
    expect(extractVideoBodyMarkdown(null as any)).toBe("")
    expect(extractVideoBodyMarkdown(undefined as any)).toBe("")
  })

  it("removes title heading", () => {
    const input = "# Video Title\n\nSome description"
    const result = extractVideoBodyMarkdown(input)
    expect(result).not.toContain("# Video Title")
    expect(result).toContain("Some description")
  })

  it("removes video embed div", () => {
    const input = '# Title\n<div class="video-embed"><iframe src="..."></iframe></div>\n\nDescription'
    const result = extractVideoBodyMarkdown(input)
    expect(result).not.toContain("video-embed")
    expect(result).toContain("Description")
  })

  it("handles content with only title", () => {
    const input = "# Just a Title"
    const result = extractVideoBodyMarkdown(input)
    expect(result).toBe("")
  })
})

describe("isLikelyEncryptedContent", () => {
  it("detects NIP-04 style payloads", () => {
    const ciphertext = "Q2lwaGVyVGV4dFBheWxvYWQ=?iv=QmFzZTY0SW5pdFZlY3Rvcg=="
    expect(isLikelyEncryptedContent(ciphertext)).toBe(true)
  })

  it("detects long version-prefixed compact payloads", () => {
    const payload = `v2:${"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".repeat(2)}`
    expect(isLikelyEncryptedContent(payload)).toBe(true)
  })

  it("returns false for short version-prefixed payloads", () => {
    const payload = "v2:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
    expect(isLikelyEncryptedContent(payload)).toBe(false)
  })

  it("detects long base64-like single-line payloads", () => {
    const payload = "Q2lwaGVydGV4dA==".repeat(10)
    expect(isLikelyEncryptedContent(payload)).toBe(true)
  })

  it("does not flag regular markdown", () => {
    const markdown = "# Lesson\n\nThis is readable markdown body content."
    expect(isLikelyEncryptedContent(markdown)).toBe(false)
  })

  it("does not flag normal URLs or html", () => {
    expect(isLikelyEncryptedContent("https://example.com/watch?v=123")).toBe(false)
    expect(isLikelyEncryptedContent("<div>Visible content</div>")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isLikelyEncryptedContent("")).toBe(false)
  })

  it("returns false for nullish runtime inputs", () => {
    expect(isLikelyEncryptedContent(null as unknown as string)).toBe(false)
    expect(isLikelyEncryptedContent(undefined as unknown as string)).toBe(false)
  })

  it("returns false for all-whitespace input", () => {
    expect(isLikelyEncryptedContent("   \n\t  ")).toBe(false)
  })

  it("returns false for very short base64-like strings", () => {
    expect(isLikelyEncryptedContent("abc")).toBe(false)
    expect(isLikelyEncryptedContent("Q2lw")).toBe(false)
    expect(isLikelyEncryptedContent("Q2lwaGVydA==".repeat(7))).toBe(false)
  })

  it("returns false for long base64-like strings containing newlines", () => {
    const payload = "Q2lwaGVydGV4dA==".repeat(10)
    expect(isLikelyEncryptedContent(payload + "\n" + payload)).toBe(false)
  })

  it("returns false for malformed version prefix with no payload", () => {
    expect(isLikelyEncryptedContent("v2:")).toBe(false)
    expect(isLikelyEncryptedContent("v1:")).toBe(false)
  })

  it("returns false for very long readable text", () => {
    const longReadable =
      "This is a long paragraph of human-readable content. It contains many words, " +
      "punctuation marks, and spaces. Encrypted payloads are typically base64 with a high " +
      "character density; natural language has lower density due to spaces and common letters."
    expect(isLikelyEncryptedContent(longReadable)).toBe(false)
  })
})
