/**
 * Service for fetching Nostr events from relays
 * Used by db-adapter to get content for courses and resources
 */

import { NostrEvent, type RelayPool, type Filter } from 'snstr'
import {
  selectPreferredEventByPriority,
  type EventPriorityConfig,
} from '@/lib/nostr-event-priority'
import { DEFAULT_RELAYS, getRelays } from './nostr-relays'

const HEX_64_REGEX = /^[0-9a-f]{64}$/i
const DTAG_EVENT_PRIORITY: EventPriorityConfig = {
  30004: 4,
  30023: 3,
  30402: 2,
  30403: 1,
}

export class NostrFetchService {
  /**
   * Fetch a single event by ID from relays
   */
  static async fetchEventById(
    eventId: string, 
    relayPool?: RelayPool,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<NostrEvent | null> {
    const normalizedEventId = eventId.trim().toLowerCase()
    if (!HEX_64_REGEX.test(normalizedEventId)) {
      return null
    }

    const normalizedRelays = relays && relays.length ? relays : getRelays('default')

    try {
      const event = relayPool
        ? await this.fetchWithPool(relayPool, normalizedEventId, normalizedRelays)
        : await this.withTemporaryPool(
            normalizedRelays,
            (pool, activeRelays) => this.fetchWithPool(pool, normalizedEventId, activeRelays)
          )

      if (event || normalizedRelays.length <= 1) {
        return event
      }
    } catch (error) {
      console.error('Error fetching Nostr event:', error)
    }

    if (normalizedRelays.length <= 1) {
      return null
    }

    return this.fetchEventByIdAcrossRelays(normalizedEventId, relayPool, normalizedRelays)
  }

  /**
   * Fetch a single event by ID across each relay independently.
   * This recovers legacy note lookups when a combined multi-relay subscription stalls.
   */
  private static async fetchEventByIdAcrossRelays(
    eventId: string,
    relayPool: RelayPool | undefined,
    relays: string[]
  ): Promise<NostrEvent | null> {
    for (const relay of Array.from(new Set(relays))) {
      try {
        const event = relayPool
          ? await this.fetchWithPool(relayPool, eventId, [relay])
          : await this.withTemporaryPool([relay], (pool, activeRelays) => this.fetchWithPool(pool, eventId, activeRelays))

        if (event) {
          return event
        }
      } catch (error) {
        console.error(`Error fetching Nostr event from relay ${relay}:`, error)
      }
    }

    return null
  }

  /**
   * Fetch multiple events by IDs
   */
  static async fetchEventsByIds(
    eventIds: string[], 
    relayPool?: RelayPool,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<Map<string, NostrEvent>> {
    const events = new Map<string, NostrEvent>()
    const normalizedRelays = relays && relays.length ? relays : getRelays('default')
    const uniqueEventIds = Array.from(
      new Set(
        eventIds
          .map((eventId) => eventId.trim().toLowerCase())
          .filter((eventId) => HEX_64_REGEX.test(eventId))
      )
    )

    if (uniqueEventIds.length === 0) {
      return events
    }

    try {
      const fetchedEvents = relayPool
        ? await this.fetchMultipleWithPool(relayPool, uniqueEventIds, normalizedRelays)
        : await this.withTemporaryPool(
            normalizedRelays,
            (pool, activeRelays) => this.fetchMultipleWithPool(pool, uniqueEventIds, activeRelays)
          )

      if (fetchedEvents.size === uniqueEventIds.length || normalizedRelays.length <= 1) {
        return fetchedEvents
      }

      const recoveredEvents = await this.fetchEventsByIdsAcrossRelays(
        uniqueEventIds.filter((eventId) => !fetchedEvents.has(eventId)),
        relayPool,
        normalizedRelays
      )
      recoveredEvents.forEach((event, eventId) => fetchedEvents.set(eventId, event))
      return fetchedEvents
    } catch (error) {
      console.error('Error fetching Nostr events:', error)
      if (normalizedRelays.length > 1) {
        return this.fetchEventsByIdsAcrossRelays(uniqueEventIds, relayPool, normalizedRelays)
      }
      return events
    }
  }

  private static async fetchEventsByIdsAcrossRelays(
    eventIds: string[],
    relayPool: RelayPool | undefined,
    relays: string[]
  ): Promise<Map<string, NostrEvent>> {
    const events = new Map<string, NostrEvent>()
    let remainingEventIds = Array.from(new Set(eventIds))

    for (const relay of Array.from(new Set(relays))) {
      if (remainingEventIds.length === 0) {
        break
      }

      try {
        const relayEvents = relayPool
          ? await this.fetchMultipleWithPool(relayPool, remainingEventIds, [relay])
          : await this.withTemporaryPool(
              [relay],
              (pool, activeRelays) => this.fetchMultipleWithPool(pool, remainingEventIds, activeRelays)
            )

        relayEvents.forEach((event, eventId) => events.set(eventId, event))
        remainingEventIds = remainingEventIds.filter((eventId) => !events.has(eventId))
      } catch (error) {
        console.error(`Error fetching Nostr events from relay ${relay}:`, error)
      }
    }

    return events
  }

  /**
   * Fetch events by d-tag values (for addressable events)
   */
  static async fetchEventsByDTags(
    dTags: string[],
    kinds: number[],
    pubkey?: string,
    relayPool?: RelayPool,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<Map<string, NostrEvent>> {
    const events = new Map<string, NostrEvent>()
    
    try {
      if (!relayPool) {
        const { RelayPool: RP } = await import('snstr')
        const tempPool = new RP(relays)
        
        try {
          const filter: any = {
            kinds,
            '#d': dTags
          }
          if (pubkey) {
            filter.authors = [pubkey]
          }
          
          await new Promise<void>((resolve) => {
            let sub: { close: () => void }
            
            const timeout = setTimeout(async () => {
              if (sub) sub.close()
              resolve()
            }, 5000) // 5 second timeout
            
            tempPool.subscribe(
              relays,
              [filter],
              (event: NostrEvent) => {
                const dTag = event.tags.find(tag => tag[0] === 'd')?.[1]
                if (dTag) {
                  events.set(
                    dTag,
                    selectPreferredEventByPriority(events.get(dTag), event, DTAG_EVENT_PRIORITY)
                  )
                }
              },
              () => {
                clearTimeout(timeout)
                if (sub) sub.close()
                resolve()
              }
            ).then(subscription => {
              sub = subscription
            })
          })
          
          tempPool.close()
          return events
        } catch (error) {
          tempPool.close()
          throw error
        }
      }
      
      // Use provided relay pool
      const filter: any = {
        kinds,
        '#d': dTags
      }
      if (pubkey) {
        filter.authors = [pubkey]
      }
      
      await new Promise<void>((resolve) => {
        let sub: { close: () => void }
        
        const timeout = setTimeout(async () => {
          if (sub) sub.close()
          resolve()
        }, 5000)
        
        relayPool.subscribe(
        relays,
        [filter],
        (event: NostrEvent) => {
          const dTag = event.tags.find(tag => tag[0] === 'd')?.[1]
          if (dTag) {
            events.set(
              dTag,
              selectPreferredEventByPriority(events.get(dTag), event, DTAG_EVENT_PRIORITY)
            )
          }
        },
        () => {
            clearTimeout(timeout)
            if (sub) sub.close()
            resolve()
          }
        ).then(subscription => {
          sub = subscription
        })
      })
      
      return events
    } catch (error) {
      console.error('Error fetching events by d-tags:', error)
      return events
    }
  }

  /**
   * Fetch events using arbitrary filters (e.g., invoice/content scoped zap receipt lookup).
   */
  static async fetchEventsByFilters(
    filters: Filter[],
    relayPool?: RelayPool,
    relays: string[] = DEFAULT_RELAYS,
    timeoutMs: number = 5000
  ): Promise<NostrEvent[]> {
    const events = new Map<string, NostrEvent>()

    try {
      // If no relay pool provided, create a temporary one
      if (!relayPool) {
        const { RelayPool: RP } = await import('snstr')
        const tempPool = new RP(relays)

        try {
          const fetchedEvents = await this.fetchByFiltersWithPool(tempPool, filters, relays, timeoutMs)
          tempPool.close()
          return fetchedEvents
        } catch (error) {
          tempPool.close()
          throw error
        }
      }

      // Use provided relay pool
      const fetched = await this.fetchByFiltersWithPool(relayPool, filters, relays, timeoutMs)
      fetched.forEach((event) => events.set(event.id, event))
      return Array.from(events.values())
    } catch (error) {
      console.error('Error fetching Nostr events by filters:', error)
      return Array.from(events.values())
    }
  }

  // Private helper methods
  private static async fetchWithPool(
    pool: RelayPool,
    eventId: string,
    relays: string[] = getRelays('default')
  ): Promise<NostrEvent | null> {
    return new Promise((resolve) => {
      let foundEvent: NostrEvent | null = null
      let sub: { close: () => void }
      
      const timeout = setTimeout(() => {
        if (sub) sub.close()
        resolve(foundEvent)
      }, 5000) // 5 second timeout
      
      pool.subscribe(
        relays && relays.length ? relays : getRelays('default'),
        [{ ids: [eventId] }],
        (event: NostrEvent) => {
          foundEvent = event
          clearTimeout(timeout)
          if (sub) sub.close()
          resolve(event)
        },
        () => {
          clearTimeout(timeout)
          if (sub) sub.close()
          resolve(foundEvent)
        }
      ).then(subscription => {
        sub = subscription
      })
    })
  }

  private static async fetchMultipleWithPool(
    pool: RelayPool, 
    eventIds: string[],
    relays: string[] = getRelays('default')
  ): Promise<Map<string, NostrEvent>> {
    const events = new Map<string, NostrEvent>()
    
    return new Promise((resolve) => {
      let sub: { close: () => void }
      
      const timeout = setTimeout(() => {
        if (sub) sub.close()
        resolve(events)
      }, 5000) // 5 second timeout
      
      pool.subscribe(
        relays && relays.length ? relays : getRelays('default'),
        [{ ids: eventIds }],
        (event: NostrEvent) => {
          events.set(event.id, event)
        },
        () => {
          clearTimeout(timeout)
          if (sub) sub.close()
          resolve(events)
        }
      ).then(subscription => {
        sub = subscription
      })
    })
  }

  private static async fetchByFiltersWithPool(
    pool: RelayPool,
    filters: Filter[],
    relays: string[] = getRelays('default'),
    timeoutMs: number = 5000
  ): Promise<NostrEvent[]> {
    const events = new Map<string, NostrEvent>()

    return new Promise((resolve) => {
      let sub: { close: () => void } | null = null
      let settled = false

      const finalize = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (sub) sub.close()
        resolve(Array.from(events.values()))
      }

      const timeout = setTimeout(finalize, timeoutMs)

      pool.subscribe(
        relays && relays.length ? relays : getRelays('default'),
        filters,
        (event: NostrEvent) => {
          events.set(event.id, event)
        },
        () => {
          finalize()
        }
      ).then((subscription) => {
        if (settled) {
          subscription.close()
          return
        }
        sub = subscription
      }).catch(() => {
        finalize()
      })
    })
  }

  private static async withTemporaryPool<T>(
    relays: string[],
    callback: (pool: RelayPool, activeRelays: string[]) => Promise<T>
  ): Promise<T> {
    const { RelayPool: RP } = await import('snstr')
    const tempPool = new RP(relays)

    try {
      return await callback(tempPool, relays)
    } finally {
      tempPool.close()
    }
  }
}
