/**
 * Ephemeral Relay Utility
 * 
 * Provides an in-memory Nostr relay for testing purposes.
 * Wraps the NostrRelay class from the snstr package.
 */

// Use require to access the non-exported ephemeral-relay module
// This works around the fact that ephemeral-relay is not exported from the main package
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NostrRelay } = require("snstr/dist/src/utils/ephemeral-relay")

export type NostrRelay = InstanceType<typeof NostrRelay>

/**
 * Start an ephemeral relay on a given port
 * @param port - Port number to start the relay on (default: 0 for auto-assign)
 * @param purgeInterval - Optional purge interval in seconds
 * @returns Promise resolving to the started relay instance
 */
export async function startEphemeralRelay(
  port: number = 0,
  purgeInterval?: number
): Promise<InstanceType<typeof NostrRelay>> {
  const relay = new NostrRelay(port, purgeInterval)
  await relay.start()
  return relay
}

/**
 * Get the relay URL from a NostrRelay instance
 * @param relay - The relay instance
 * @returns The WebSocket URL for the relay
 */
export function getRelayUrl(relay: InstanceType<typeof NostrRelay>): string {
  return relay.url
}

/**
 * Stop an ephemeral relay
 * @param relay - The relay instance to stop
 */
export async function stopEphemeralRelay(relay: InstanceType<typeof NostrRelay>): Promise<void> {
  await relay.close()
}
