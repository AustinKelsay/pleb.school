"use client"

import { useEffect, useState } from "react"

interface UseIdleMountOptions {
  enabled?: boolean
  timeoutMs?: number
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

export function useIdleMount(options: UseIdleMountOptions = {}) {
  const {
    enabled = true,
    timeoutMs = 150,
  } = options
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsMounted(false)
      return
    }

    if (isMounted) {
      return
    }

    const view = window as WindowWithIdleCallback
    let timeoutId: number | null = null
    let idleId: number | null = null

    const mount = () => {
      setIsMounted(true)
    }

    if (typeof view.requestIdleCallback === "function") {
      idleId = view.requestIdleCallback(mount, { timeout: timeoutMs })
    } else {
      timeoutId = window.setTimeout(mount, timeoutMs)
    }

    return () => {
      if (idleId !== null && typeof view.cancelIdleCallback === "function") {
        view.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [enabled, isMounted, timeoutMs])

  return isMounted
}
