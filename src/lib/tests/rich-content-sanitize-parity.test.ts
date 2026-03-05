/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"

const ORIGINAL_WINDOW = window

async function sanitizeInBothBranches(input: string) {
  vi.resetModules()
  Object.defineProperty(globalThis, "window", {
    value: ORIGINAL_WINDOW,
    configurable: true,
    writable: true,
  })
  const clientModule = await import("../rich-content-sanitize.client")
  const clientOutput = clientModule.sanitizeRichContent(input)

  vi.resetModules()
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    configurable: true,
    writable: true,
  })
  const serverModule = await import("../rich-content-sanitize.client")
  const serverOutput = serverModule.sanitizeRichContent(input)

  Object.defineProperty(globalThis, "window", {
    value: ORIGINAL_WINDOW,
    configurable: true,
    writable: true,
  })

  return { clientOutput, serverOutput }
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: ORIGINAL_WINDOW,
    configurable: true,
    writable: true,
  })
  vi.resetModules()
})

describe("sanitizeRichContent branch parity", () => {
  it("matches client and server fallback outputs for high-risk payloads", async () => {
    const payloads = [
      '<div>Hello</div><script>alert("xss")</script><p>World</p>',
      '<a href="java&#x09;script&#58;alert(1)">Click</a>',
      '<img src=x onerror=alert(1)>',
      '<iframe src="https://evil.example.com/embed/123" allowfullscreen allow="autoplay"></iframe>',
      '<iframe src="//evil.example.com/embed/123" allowfullscreen></iframe>',
      '<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen frameborder="0"></iframe>',
    ]

    for (const payload of payloads) {
      const { clientOutput, serverOutput } = await sanitizeInBothBranches(payload)
      expect(serverOutput).toBe(clientOutput)
    }
  })

  it("enforces iframe sandbox and strips unsafe iframe attributes in both branches", async () => {
    const payload = '<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen allow="autoplay" frameborder="0"></iframe>'
    const { clientOutput, serverOutput } = await sanitizeInBothBranches(payload)

    expect(clientOutput).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"')
    expect(clientOutput).not.toContain("allowfullscreen")
    expect(clientOutput).not.toContain("frameborder")
    expect(clientOutput).not.toContain('allow="')
    expect(serverOutput).toBe(clientOutput)
  })

  it("rejects protocol-relative iframe sources in both branches", async () => {
    const payload = '<iframe src="//evil.example.com/embed/123"></iframe>'
    const { clientOutput, serverOutput } = await sanitizeInBothBranches(payload)

    expect(clientOutput).not.toContain('//evil.example.com/embed/123')
    expect(clientOutput).not.toContain(" src=")
    expect(serverOutput).toBe(clientOutput)
  })
})
