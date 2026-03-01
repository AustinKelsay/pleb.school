import { describe, expect, it } from "vitest"
import { sanitizeRichContent } from "../rich-content-sanitize.client"

describe("sanitizeRichContent", () => {
  it("removes script tags", () => {
    const input = '<div>Hello</div><script>alert("xss")</script><p>World</p>'
    const result = sanitizeRichContent(input)
    expect(result).not.toContain("<script")
    expect(result).not.toContain("alert")
  })

  it("removes javascript urls", () => {
    const input = '<a href="javascript:alert(1)">Click</a>'
    const result = sanitizeRichContent(input)
    expect(result).not.toContain("javascript:")
    expect(result).toContain("Click")
  })

  it("preserves safe video embeds", () => {
    const input = '<iframe src="https://www.youtube.com/embed/abc123" frameborder="0" allowfullscreen></iframe>'
    const result = sanitizeRichContent(input)
    expect(result).toContain("youtube.com")
    expect(result).toContain("<iframe")
  })

  it("preserves native video controls attribute", () => {
    const input = '<video controls src="https://example.com/video.mp4"></video>'
    const result = sanitizeRichContent(input)
    expect(result).toContain("<video")
    expect(result).toContain("controls")
  })

  it("strips target attributes from links", () => {
    const input = '<a href="https://example.com" target="_blank">Link</a>'
    const result = sanitizeRichContent(input)
    expect(result).toContain("<a")
    expect(result).toContain('href="https://example.com"')
    expect(result).not.toContain("target=")
  })
})
