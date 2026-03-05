/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest"
import {
  clampSeekTarget,
  extractVimeoId,
  extractVideoSource,
  extractYouTubeId,
  getVideoProvider,
  isEditableTarget,
  isEmbeddedVideo,
  normalizeSkipSeconds,
} from "@/lib/video-playback"

describe("video-playback helpers", () => {
  it("normalizes skip seconds to supported values", () => {
    expect(normalizeSkipSeconds(10)).toBe(10)
    expect(normalizeSkipSeconds(15)).toBe(15)
    expect(normalizeSkipSeconds(30)).toBe(10)
    expect(normalizeSkipSeconds(undefined)).toBe(10)
  })

  it("detects provider from URL", () => {
    expect(getVideoProvider("https://youtu.be/abc123")).toBe("youtube")
    expect(getVideoProvider("https://vimeo.com/1234567")).toBe("vimeo")
    expect(getVideoProvider("https://cdn.example.com/video.mp4")).toBe("direct")
    expect(getVideoProvider("https://example.com/player?next=clip.mp4")).toBe("unknown")
    expect(getVideoProvider("https://example.com/embed/player")).toBe("unknown")
  })

  it("extracts youtube and vimeo IDs", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYouTubeId("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(extractVimeoId("https://player.vimeo.com/video/987654321")).toBe("987654321")
    expect(extractVimeoId("https://example.com")).toBeNull()
  })

  it("clamps seek target by zero floor and optional duration ceiling", () => {
    expect(clampSeekTarget(-8, 100)).toBe(0)
    expect(clampSeekTarget(35, 20)).toBe(20)
    expect(clampSeekTarget(12, undefined)).toBe(12)
    expect(clampSeekTarget(8, 0)).toBe(8)
  })

  it("extracts fallback video source from HTML content", () => {
    const youtubeHtml = '<iframe src="https://www.youtube.com/embed/abc123"></iframe>'
    expect(extractVideoSource(youtubeHtml)).toBe("https://www.youtube.com/watch?v=abc123")

    const directHtml = '<video><source src="https://cdn.example.com/test.mp4"></video>'
    expect(extractVideoSource(directHtml)).toBe("https://cdn.example.com/test.mp4")

    const queryStringHtml = "<video><source src='https://cdn.example.com/test.mkv?token=abc#frag'></video>"
    expect(extractVideoSource(queryStringHtml)).toBe("https://cdn.example.com/test.mkv?token=abc#frag")

    const youtubeNoCookieHtml = "<iframe src='https://www.youtube-nocookie.com/embed/abc123?si=xyz'></iframe>"
    expect(extractVideoSource(youtubeNoCookieHtml)).toBe("https://www.youtube.com/watch?v=abc123")

    const vimeoSingleQuoteHtml = "<iframe src='https://player.vimeo.com/video/123456789?autoplay=1'></iframe>"
    expect(extractVideoSource(vimeoSingleQuoteHtml)).toBe("https://vimeo.com/123456789")
  })

  it("detects embedded video tags case-insensitively", () => {
    expect(isEmbeddedVideo("<VIDEO src='https://cdn.example.com/test.mp4'></VIDEO>")).toBe(true)
    expect(isEmbeddedVideo("<IFRAME src='https://player.vimeo.com/video/1'></IFRAME>")).toBe(true)
    expect(isEmbeddedVideo("<div>No embed</div>")).toBe(false)
  })
})

describe("video-playback editable target guard", () => {
  it("returns true for input-like and contenteditable targets", () => {
    const input = document.createElement("input")
    expect(isEditableTarget(input)).toBe(true)

    const div = document.createElement("div")
    div.setAttribute("contenteditable", "true")
    expect(isEditableTarget(div)).toBe(true)
  })

  it("returns false for non-editable elements", () => {
    const button = document.createElement("button")
    expect(isEditableTarget(button)).toBe(false)
  })
})
