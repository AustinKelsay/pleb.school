/**
 * Service for fetching Nostr events from relays
 * Used by db-adapter to get content for courses and resources
 */

import { NostrEvent, type RelayPool, type Filter } from 'snstr'
import { DEFAULT_RELAYS, getRelays } from './nostr-relays'

export class NostrFetchService {
  /**
   * Fetch a single event by ID from relays
   */
  static async fetchEventById(
    eventId: string, 
    relayPool?: RelayPool,
    relays: string[] = DEFAULT_RELAYS
  ): Promise<NostrEvent | null> {
    try {
      // If no relay pool provided, create a temporary one
      if (!relayPool) {
        // Use dynamic import to avoid server-side issues
        const { RelayPool: RP } = await import('snstr')
        const tempPool = new RP(relays)
        
        try {
          const event = await this.fetchWithPool(tempPool, eventId, relays)
          tempPool.close()
          return event
        } catch (error) {
          tempPool.close()
          throw error
        }
      }
      
      // Use provided relay pool
      return await this.fetchWithPool(relayPool, eventId, relays)
    } catch (error) {
      console.error('Error fetching Nostr event:', error)
      return null
    }
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
    
    try {
      // If no relay pool provided, create a temporary one
      if (!relayPool) {
        const { RelayPool: RP } = await import('snstr')
        const tempPool = new RP(relays)
        
        try {
          const fetchedEvents = await this.fetchMultipleWithPool(tempPool, eventIds, relays)
          tempPool.close()
          return fetchedEvents
        } catch (error) {
          tempPool.close()
          throw error
        }
      }
      
      // Use provided relay pool
      return await this.fetchMultipleWithPool(relayPool, eventIds, relays)
    } catch (error) {
      console.error('Error fetching Nostr events:', error)
      return events
    }
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
                  events.set(dTag, event)
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
              events.set(dTag, event)
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
}
