/* @vitest-environment jsdom */

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/optimized-image", () => ({
  OptimizedImage: (props: { alt?: string }) => createElement("img", { alt: props.alt ?? "image" }),
}))

import { VideoPlayer } from "@/components/ui/video-player"

function mountVideoPlayer(skipSeconds: 10 | 15 = 10) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      createElement(VideoPlayer, {
        url: "https://cdn.example.com/lesson.mp4",
        title: "Test Video",
        skipSeconds,
      })
    )
  })

  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function markVideoReady(video: HTMLVideoElement, duration: number) {
  Object.defineProperty(video, "duration", {
    configurable: true,
    get: () => duration,
  })
  act(() => {
    video.dispatchEvent(new Event("loadedmetadata"))
  })
}

describe("VideoPlayer seek controls", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = ""
  })

  it("rewinds and fast-forwards direct videos with clamping", () => {
    const skipSeconds = 10
    const { container, unmount } = mountVideoPlayer(skipSeconds)
    const video = container.querySelector("video")
    expect(video).toBeInstanceOf(HTMLVideoElement)
    if (!video) {
      unmount()
      throw new Error("Expected direct video element to render")
    }

    markVideoReady(video, 120)
    video.currentTime = 5

    const rewindButton = container.querySelector(`button[aria-label="Rewind ${skipSeconds} seconds"]`)
    const fastForwardButton = container.querySelector(`button[aria-label="Fast-forward ${skipSeconds} seconds"]`)
    expect(rewindButton).toBeInstanceOf(HTMLButtonElement)
    expect(fastForwardButton).toBeInstanceOf(HTMLButtonElement)
    if (!rewindButton || !fastForwardButton) {
      unmount()
      throw new Error("Expected seek controls to render")
    }

    act(() => {
      rewindButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(video.currentTime).toBe(0)

    video.currentTime = 115
    act(() => {
      fastForwardButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(video.currentTime).toBe(120)

    unmount()
  })

  it("handles keyboard shortcuts and ignores editable targets", () => {
    const skipSeconds = 10
    const { container, unmount } = mountVideoPlayer(skipSeconds)
    const video = container.querySelector("video")
    const playerRoot = container.querySelector('div[aria-label=\"Video player\"]')
    expect(video).toBeInstanceOf(HTMLVideoElement)
    expect(playerRoot).toBeInstanceOf(HTMLDivElement)
    if (!video || !playerRoot) {
      unmount()
      throw new Error("Expected player root and video to render")
    }

    markVideoReady(video, 120)
    video.currentTime = 50

    act(() => {
      playerRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }))
    })
    expect(video.currentTime).toBe(50 - skipSeconds)

    act(() => {
      playerRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }))
    })
    expect(video.currentTime).toBe(50)

    const input = document.createElement("input")
    playerRoot.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }))
    })
    expect(video.currentTime).toBe(50)

    unmount()
  })

  it("renders a YouTube iframe even when JS API is unavailable", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(VideoPlayer, {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "YouTube Test Video",
        })
      )
    })

    const iframe = container.querySelector('iframe[title="YouTube video player"]')
    expect(iframe).toBeInstanceOf(HTMLIFrameElement)
    expect(iframe?.getAttribute("src")).toContain("/embed/dQw4w9WgXcQ")

    act(() => root.unmount())
    container.remove()
  })

  it("does not consume seek shortcuts when seeking is not ready", () => {
    const { container, unmount } = mountVideoPlayer(10)
    const playerRoot = container.querySelector('div[aria-label=\"Video player\"]')
    const video = container.querySelector("video")
    expect(playerRoot).toBeInstanceOf(HTMLDivElement)
    expect(video).toBeInstanceOf(HTMLVideoElement)
    if (!playerRoot || !video) {
      unmount()
      throw new Error("Expected player root and video to render")
    }

    video.currentTime = 30
    const keyEvent = new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true })

    act(() => {
      playerRoot.dispatchEvent(keyEvent)
    })

    expect(keyEvent.defaultPrevented).toBe(false)
    expect(video.currentTime).toBe(30)
    unmount()
  })

  it("does not render unsafe javascript URLs as playable sources", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(VideoPlayer, {
          url: "javascript:alert(1)",
          title: "Unsafe URL Test",
        })
      )
    })

    expect(container.textContent).toContain("No Video Available")
    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it("starts playback when the thumbnail container is activated by keyboard", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(VideoPlayer, {
          url: "https://cdn.example.com/lesson.mp4",
          title: "Thumbnail Test",
          thumbnailUrl: "https://cdn.example.com/thumb.png",
        })
      )
    })

    const thumbnail = container.querySelector('div[role="button"][aria-label="Play video: Thumbnail Test"]')
    expect(thumbnail).toBeInstanceOf(HTMLDivElement)
    if (!thumbnail) {
      act(() => root.unmount())
      container.remove()
      throw new Error("Expected thumbnail container to render")
    }

    act(() => {
      thumbnail.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(container.querySelector("video")).toBeInstanceOf(HTMLVideoElement)

    act(() => {
      root.render(
        createElement(VideoPlayer, {
          url: "https://cdn.example.com/lesson.mp4",
          title: "Thumbnail Test",
          thumbnailUrl: "https://cdn.example.com/thumb-space.png",
        })
      )
    })

    const thumbnailForSpace = container.querySelector('div[role="button"][aria-label="Play video: Thumbnail Test"]')
    expect(thumbnailForSpace).toBeInstanceOf(HTMLDivElement)
    if (!thumbnailForSpace) {
      act(() => root.unmount())
      container.remove()
      throw new Error("Expected thumbnail container to render for Space activation")
    }

    act(() => {
      thumbnailForSpace.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
    })
    expect(container.querySelector("video")).toBeInstanceOf(HTMLVideoElement)

    act(() => root.unmount())
    container.remove()
  })

  it("starts playback when the thumbnail container is clicked", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(VideoPlayer, {
          url: "https://cdn.example.com/lesson.mp4",
          title: "Thumbnail Test",
          thumbnailUrl: "https://cdn.example.com/thumb.png",
        })
      )
    })

    const thumbnail = container.querySelector('div[role="button"][aria-label="Play video: Thumbnail Test"]')
    expect(thumbnail).toBeInstanceOf(HTMLDivElement)
    if (!thumbnail) {
      act(() => root.unmount())
      container.remove()
      throw new Error("Expected thumbnail container to render")
    }

    act(() => {
      thumbnail.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(container.querySelector("video")).toBeInstanceOf(HTMLVideoElement)

    act(() => root.unmount())
    container.remove()
  })
})
