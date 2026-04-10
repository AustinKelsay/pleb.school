"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

type Dedupe = "session" | "day" | false

export interface UseViewsOptions {
  ns?: string
  id?: string
  key?: string
  track?: boolean
  dedupe?: Dedupe
}

// Simple shared bus so multiple hook instances stay in sync for the same key
type ViewsBus = {
  counts: Map<string, number>
  listeners: Map<string, Set<(n: number) => void>>
  inflightGet: Map<string, Promise<number | undefined>>
  subscribe: (key: string, fn: (n: number) => void) => () => void
  emit: (key: string, n: number) => void
}

const viewsBus: ViewsBus = (() => {
  const g = globalThis as any
  if (!g.__viewsBus) {
    const counts = new Map<string, number>()
    const listeners = new Map<string, Set<(n: number) => void>>()
    const inflightGet = new Map<string, Promise<number | undefined>>()
    const subscribe = (key: string, fn: (n: number) => void) => {
      const set = listeners.get(key) ?? new Set<(n: number) => void>()
      set.add(fn)
      listeners.set(key, set)
      return () => {
        const s = listeners.get(key)
        if (s) {
          s.delete(fn)
          if (!s.size) listeners.delete(key)
        }
      }
    }
    const emit = (key: string, n: number) => {
      counts.set(key, n)
      const s = listeners.get(key)
      if (s) s.forEach((fn) => fn(n))
    }
    g.__viewsBus = { counts, listeners, inflightGet, subscribe, emit }
  }
  return g.__viewsBus as ViewsBus
})()

export function useViews(options: UseViewsOptions = {}) {
  const pathname = usePathname()
  const {
    ns,
    id,
    key,
    track = true,
    dedupe = "session",
  } = options

  const resolvedKey = useMemo(() => {
    if (key) return key
    if (ns && id) return `views:${ns}:${id}`
    return `views:path:${pathname}`
  }, [key, ns, id, pathname])

  const [count, setCount] = useState<number | null>(null)

  // In-memory fallback for environments where Storage access throws
  const memSet: Set<string> = useMemo(() => {
    const g = globalThis as any
    if (!g.__viewsDedupeMem) g.__viewsDedupeMem = new Set<string>()
    return g.__viewsDedupeMem as Set<string>
  }, [])

  // Helper for client-side deduping
  const shouldTrackOnce = useCallback((): boolean => {
    if (!track) return false
    if (!dedupe) return true

    const storage = dedupe === "session" ? sessionStorage : localStorage
    const baseKey = `__viewed__:${resolvedKey}`
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const dedupeKey = dedupe === "day" ? `${baseKey}:${today}` : baseKey

    // Try read with guard (Safari private can throw on getItem)
    try {
      const seen = storage.getItem(dedupeKey)
      if (seen) return false
    } catch {
      if (memSet.has(dedupeKey)) return false
    }

    // Try write with guard; fallback to memory set if it throws
    try {
      storage.setItem(dedupeKey, "1")
    } catch {
      memSet.add(dedupeKey)
    }

    return true
  }, [dedupe, memSet, resolvedKey, track])

  // Deduped GET that broadcasts to all listeners
  const refetchCount = useCallback(async (): Promise<number | undefined> => {
    let p = viewsBus.inflightGet.get(resolvedKey)
    if (!p) {
      p = (async () => {
        try {
          const params = new URLSearchParams()
          params.set("key", resolvedKey)
          const res = await fetch(`/api/views?${params.toString()}`, {
            method: "GET",
            cache: "no-store",
          })
          const json = (await res.json()) as { count?: number }
          const val = typeof json.count === "number" ? json.count : undefined
          if (typeof val === "number") viewsBus.emit(resolvedKey, val)
          return val
        } catch {
          return undefined
        } finally {
          // Clear inflight slot for this key
          const existing = viewsBus.inflightGet.get(resolvedKey)
          if (existing === p) viewsBus.inflightGet.delete(resolvedKey)
        }
      })()
      viewsBus.inflightGet.set(resolvedKey, p)
    }
    return p
  }, [resolvedKey])

  // Subscribe to shared bus and only fetch immediately for read-only consumers.
  useEffect(() => {
    const unsubscribe = viewsBus.subscribe(resolvedKey, (n) => setCount(n))
    const existing = viewsBus.counts.get(resolvedKey)
    if (typeof existing === "number") setCount(existing)
    if (!track) {
      void refetchCount()
    }
    return unsubscribe
  }, [refetchCount, resolvedKey, track])

  // Increment once based on dedupe policy. POST first, then fall back to GET only when needed.
  useEffect(() => {
    if (!track) {
      return
    }

    let cancelled = false
    const maybeIncrement = async () => {
      if (!shouldTrackOnce()) {
        await refetchCount()
        return
      }

      try {
        const res = await fetch("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: resolvedKey }),
        })
        if (!res.ok) {
          throw new Error(`POST /api/views failed: ${res.status}`)
        }
        const json = (await res.json()) as { count?: number }
        if (typeof json.count === "number") {
          viewsBus.emit(resolvedKey, json.count)
        } else {
          await refetchCount()
        }
      } catch {
        // Fallback to a read if POST fails
        await refetchCount()
      }
    }
    void maybeIncrement()
    return () => {
      cancelled = true
    }
  }, [refetchCount, resolvedKey, shouldTrackOnce, track])

  return { key: resolvedKey, count }
}
