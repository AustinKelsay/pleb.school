"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

/**
 * QueryClient provider for TanStack Query
 * Provides caching, synchronization, and state management for server state
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Stale time: How long data is considered fresh
        staleTime: 60 * 1000, // 1 minute
        // GC time: How long data stays in cache after becoming unused
        gcTime: 10 * 60 * 1000, // 10 minutes
        // Retry configuration - don't retry on client errors (4xx)
        retry: (failureCount, error) => {
          // Check for HTTP status codes in the error
          // Handle fetch Response errors, custom error objects, or error messages
          const status = (error as { status?: number })?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            return false;
          }
          // Fallback: check error message for common client error patterns
          if (error instanceof Error) {
            const message = error.message.toLowerCase();
            if (message.includes('404') || message.includes('400') ||
                message.includes('401') || message.includes('403') ||
                message.includes('not found') || message.includes('unauthorized') ||
                message.includes('forbidden')) {
              return false;
            }
          }
          return failureCount < 3;
        },
        // Don't refetch on window focus for better UX
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
} 