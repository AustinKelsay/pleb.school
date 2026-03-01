import { describe, expect, it, vi } from "vitest"

vi.mock("@/data/types", () => ({
  parseCourseEvent: vi.fn(),
  parseEvent: vi.fn(),
}))

import { parseCourseEvent, parseEvent } from "@/data/types"
import { searchCourses, searchResources } from "../search"

describe("search highlighting", () => {
  it("escapes html before applying course highlights", () => {
    vi.mocked(parseCourseEvent).mockReturnValue({
      title: '<img src=x onerror="alert(1)">',
      name: "",
      description: 'alpha <script>alert("xss")</script>',
    } as any)

    const results = searchCourses(
      [
        {
          id: "course-1",
          price: 0,
          userId: "user-1",
          note: {
            tags: [],
          },
        } as any,
      ],
      "alpha"
    )

    expect(results).toHaveLength(1)
    expect(results[0].highlights.title).toContain("&lt;img")
    expect(results[0].highlights.title).not.toContain("<img")
    expect(results[0].highlights.description).toContain("<mark>alpha</mark>")
    expect(results[0].highlights.description).toContain("&lt;script&gt;")
  })

  it("escapes html before applying resource highlights", () => {
    vi.mocked(parseEvent).mockReturnValue({
      title: "<b>alpha</b>",
      summary: '<a href="javascript:alert(1)">alpha</a>',
    } as any)

    const results = searchResources(
      [
        {
          id: "resource-1",
          price: 0,
          userId: "user-1",
          note: {
            tags: [],
          },
        } as any,
      ],
      "alpha"
    )

    expect(results).toHaveLength(1)
    expect(results[0].highlights.title).toContain("&lt;b&gt;<mark>alpha</mark>&lt;/b&gt;")
    expect(results[0].highlights.description).toContain("&lt;a")
    expect(results[0].highlights.description).not.toContain("<a href")
  })
})

