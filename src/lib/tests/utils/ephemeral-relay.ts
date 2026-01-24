/**
 * Ephemeral Relay Utility (Test-Only)
 *
 * Provides an in-memory Nostr relay for testing purposes.
 * Wraps the NostrRelay class from the snstr package.
 *
 * This file is intentionally placed in tests/utils/ to ensure it's never
 * bundled into production code.
 */

import { NostrRelay } from "snstr/utils/ephemeral-relay"

export type { NostrRelay }

/**
 * Start an ephemeral relay on a given port
 * @param port - Port number to start the relay on (default: 0 for auto-assign)
 * @param purgeInterval - Optional purge interval in seconds
 * @returns Promise resolving to the started relay instance
 */
export async function startEphemeralRelay(
  port: number = 0,
  purgeInterval?: number
): Promise<NostrRelay> {
  const relay = new NostrRelay(port, purgeInterval)
  await relay.start()
  return relay
}

/**
 * Get the relay URL from a NostrRelay instance
 * @param relay - The relay instance
 * @returns The WebSocket URL for the relay
 */
export function getRelayUrl(relay: NostrRelay): string {
  return relay.url
}

/**
 * Stop an ephemeral relay
 * @param relay - The relay instance to stop
 */
export async function stopEphemeralRelay(relay: NostrRelay): Promise<void> {
  await relay.close()
}
