"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { SnstrProvider } from "@/contexts/snstr-context"
import { shouldEnableSnstrForPathname } from "@/lib/nostr-route-scope"

interface RouteScopedSnstrProviderProps {
  children: ReactNode
}

export function RouteScopedSnstrProvider({ children }: RouteScopedSnstrProviderProps) {
  const pathname = usePathname()

  if (!shouldEnableSnstrForPathname(pathname)) {
    return <>{children}</>
  }

  return <SnstrProvider>{children}</SnstrProvider>
}
