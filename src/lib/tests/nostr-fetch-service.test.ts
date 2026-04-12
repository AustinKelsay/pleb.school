import { afterEach, describe, expect, it, vi } from "vitest"

import type { NostrEvent } from "@/data/types"
import { NostrFetchService } from "@/lib/nostr-fetch-service"

const D_TAG_EVENT: NostrEvent = {
  id: "event-1",
  pubkey: "pubkey-1",
  created_at: 1,
  kind: 30004,
  tags: [["d", "starter-course"]],
  content: "",
  sig: "sig-1",
}

describe("NostrFetchService.fetchEventsByDTags", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("recovers missing d-tag results by retrying each relay independently", async () => {
    const service = NostrFetchService as any

    vi.spyOn(service, "withTemporaryPool").mockImplementation(
      async (...args: any[]) => args[1]({}, args[0])
    )

    const fetchSpy = vi.spyOn(service, "fetchEventsByDTagsWithPool").mockImplementation(
      async (...args: any[]) => {
        const relays = args[4] as string[]
        if (relays.length > 1) {
          return new Map()
        }

        return relays[0] === "wss://nos.lol"
          ? new Map([["starter-course", D_TAG_EVENT]])
          : new Map()
      }
    )

    const result = await NostrFetchService.fetchEventsByDTags(
      ["starter-course"],
      [30004],
      undefined,
      undefined,
      ["wss://nos.lol", "wss://relay.damus.io"]
    )

    expect(result.get("starter-course")).toEqual(D_TAG_EVENT)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
