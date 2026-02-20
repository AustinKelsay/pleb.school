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
          // Prefer numeric status/statusCode from error object (covers fetch errors,
          // custom error classes, and most HTTP client libraries)
          const err = error as { status?: number; statusCode?: number };
          const status = err?.status ?? err?.statusCode;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            return false;
          }

          // Fallback: parse error message with boundary-aware matching to avoid
          // false positives like "400ms" or "1404 items"
          if (error instanceof Error) {
            const message = error.message.toLowerCase();
            // Word-boundary regex for status codes (e.g., "404" but not "1404")
            if (/\b(400|401|403|404)\b/.test(message)) {
              return false;
            }
            // Exact phrase matching for error descriptions
            if (
              message.includes('not found') ||
              message.includes('unauthorized') ||
              message.includes('forbidden') ||
              message.includes('bad request')
            ) {
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