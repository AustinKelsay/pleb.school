"use client";

import { createContext, useContext, useRef, ReactNode } from 'react';
import { RelayPool, Filter, NostrEvent } from 'snstr';
import nostrConfig from '../../config/nostr.json';
import { DEFAULT_RELAYS } from '@/lib/nostr-relays';

type NostrRelayConfig = {
  relays: Record<string, string[]>;
};

export { DEFAULT_RELAYS };

// Export the full config for use elsewhere
export { nostrConfig };

// Types for the context
interface SnstrContextType {
  relayPool: RelayPool;
  relays: string[];
  subscribe: (
    filters: Filter[], 
    onEvent: (event: NostrEvent, relayUrl: string) => void, 
    onEose?: () => void
  ) => Promise<{ close: () => void }>;
  publish: (event: NostrEvent) => Promise<unknown[]>;
}

// Create the context
const SnstrContext = createContext<SnstrContextType | null>(null);

// Provider props interface
interface SnstrProviderProps {
  children: ReactNode;
  relays?: string[];
  relaySet?: 'default' | 'content' | 'profile' | 'zapThreads';
}

// Provider component
export function SnstrProvider({ children, relays, relaySet = 'default' }: SnstrProviderProps) {
  // Use provided relays, or fall back to config-based relay set
  const activeRelays = relays || (nostrConfig as NostrRelayConfig).relays[relaySet] || DEFAULT_RELAYS;
  // Use ref to ensure single instance across re-renders
  const poolRef = useRef<RelayPool | null>(null);

  if (!poolRef.current) {
    poolRef.current = new RelayPool(activeRelays);
  }

  // Simple subscribe method that uses the shared pool
  const subscribe = async (
    filters: Filter[], 
    onEvent: (event: NostrEvent, relayUrl: string) => void,
    onEose?: () => void
  ) => {
    return poolRef.current!.subscribe(
      activeRelays,
      filters,
      onEvent,
      onEose || (() => {})
    );
  };

  // Simple publish method that uses the shared pool
  const publish = async (event: NostrEvent) => {
    const publishPromises = poolRef.current!.publish(activeRelays, event);
    return Promise.all(publishPromises);
  };

  const contextValue: SnstrContextType = {
    relayPool: poolRef.current,
    relays: activeRelays,
    subscribe,
    publish
  };

  return (
    <SnstrContext.Provider value={contextValue}>
      {children}
    </SnstrContext.Provider>
  );
}

// Hook to use the context
export function useSnstrContext(): SnstrContextType {
  const context = useContext(SnstrContext);
  if (!context) {
    throw new Error('useSnstrContext must be used within SnstrProvider');
  }
  return context;
}