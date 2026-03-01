import { describe, expect, it } from "vitest"

import { parseOptionalPositiveInt } from "@/lib/api-utils"

describe("parseOptionalPositiveInt", () => {
  it("returns undefined for null input", () => {
    expect(parseOptionalPositiveInt(null)).toBeUndefined()
  })

  it("returns null for invalid inputs", () => {
    expect(parseOptionalPositiveInt("")).toBeNull()
    expect(parseOptionalPositiveInt("abc")).toBeNull()
    expect(parseOptionalPositiveInt("1abc")).toBeNull()
    expect(parseOptionalPositiveInt("1.5")).toBeNull()
    expect(parseOptionalPositiveInt("01")).toBeNull()
    expect(parseOptionalPositiveInt("0")).toBeNull()
    expect(parseOptionalPositiveInt("-1")).toBeNull()
    expect(parseOptionalPositiveInt(" 7 ")).toBeNull()
    expect(parseOptionalPositiveInt("Infinity")).toBeNull()
  })

  it("returns parsed value for valid positive integer strings", () => {
    expect(parseOptionalPositiveInt("1")).toBe(1)
    expect(parseOptionalPositiveInt("42")).toBe(42)
  })

  it("returns null for negative numeric strings", () => {
    expect(parseOptionalPositiveInt("-5")).toBeNull()
  })

  it("returns null for partially numeric strings", () => {
    expect(parseOptionalPositiveInt("12px")).toBeNull()
  })
})
