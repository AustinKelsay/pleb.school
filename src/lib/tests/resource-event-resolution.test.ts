import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeAddress } from "snstr"

import { NostrFetchService } from "@/lib/nostr-fetch-service"
import {
  fetchResourceEventOnClient,
  fetchResourceEventOnServer,
} from "@/lib/resource-event-resolution"

const RESOURCE_EVENT = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1_700_000_000,
  kind: 30023,
  tags: [["d", "legacy-resource"]],
  content: "",
  sig: "c".repeat(128),
}

describe("resource event resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses naddr fallback references on the server for UUID-backed resources", async () => {
    const fallbackNaddr = encodeAddress({
      identifier: "legacy-resource",
      kind: 30023,
      pubkey: RESOURCE_EVENT.pubkey,
    })

    vi.spyOn(NostrFetchService, "fetchEventsByFilters").mockImplementation(async (filters) => {
      const dTag = filters[0]?.["#d"]?.[0]
      return dTag === "123e4567-e89b-12d3-a456-426614174000" ? [] : [RESOURCE_EVENT]
    })

    const result = await fetchResourceEventOnServer(
      "123e4567-e89b-12d3-a456-426614174000",
      fallbackNaddr
    )

    expect(result.error).toBeNull()
    expect(result.event).toEqual(RESOURCE_EVENT)
  })

  it("uses naddr fallback references on the client for UUID-backed resources", async () => {
    const fallbackNaddr = encodeAddress({
      identifier: "legacy-resource",
      kind: 30023,
      pubkey: RESOURCE_EVENT.pubkey,
    })

    const fetchSingleEvent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RESOURCE_EVENT)

    const result = await fetchResourceEventOnClient(
      "123e4567-e89b-12d3-a456-426614174000",
      fetchSingleEvent,
      fallbackNaddr
    )

    expect(fetchSingleEvent).toHaveBeenNthCalledWith(
      1,
      {
        kinds: [30023, 30402, 30403],
        "#d": ["123e4567-e89b-12d3-a456-426614174000"],
      }
    )
    expect(fetchSingleEvent).toHaveBeenNthCalledWith(
      2,
      {
        kinds: [30023],
        "#d": ["legacy-resource"],
        authors: [RESOURCE_EVENT.pubkey],
      },
      expect.objectContaining({
        relays: expect.any(Array),
      })
    )
    expect(result.error).toBeNull()
    expect(result.event).toEqual(RESOURCE_EVENT)
  })
})
