import type { UniversalIdResult } from "@/lib/universal-router"

export function extractRelayHintsFromDecodedData(
  decodedData?: UniversalIdResult["decodedData"]
): string[] {
  if (!decodedData || typeof decodedData !== "object" || !("relays" in decodedData)) {
    return []
  }

  const relays = (decodedData as { relays?: unknown }).relays
  if (!Array.isArray(relays)) {
    return []
  }

  return relays
    .filter((relay): relay is string => typeof relay === "string")
    .map((relay) => relay.trim())
    .filter(Boolean)
}
