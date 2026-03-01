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
})

