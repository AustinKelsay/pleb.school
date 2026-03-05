function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return null
}

function isAnalyticsProviderDisabled(provider: string | undefined): boolean {
  if (!provider) {
    return false
  }

  const normalized = provider.trim().toLowerCase()
  return ["none", "off", "false", "0"].includes(normalized)
}

type AnalyticsEventValue = string | number | boolean | null | undefined

type AnalyticsEventProperties = Record<string, AnalyticsEventValue>

type TrackFn = (name: string, properties?: AnalyticsEventProperties) => void
type InjectFn = (props?: { framework?: string }) => void

let cachedTrack: TrackFn | null = null
let cachedInject: InjectFn | null = null
let runtimeInitialized = false
let runtimeInjected = false
let initPromise: Promise<void> | null = null

const ANALYTICS_READY_POLL_INTERVAL_MS = 25
const ANALYTICS_READY_POLL_ATTEMPTS = 40

function getTrackedEventProperties(properties?: AnalyticsEventProperties) {
  if (!properties) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined)
  ) as AnalyticsEventProperties
}

function isAnalyticsRuntimeReady(): boolean {
  return typeof (window as Window & { va?: unknown }).va === "function"
}

async function waitForAnalyticsRuntimeReady(): Promise<boolean> {
  if (isAnalyticsRuntimeReady()) {
    return true
  }

  for (let attempt = 0; attempt < ANALYTICS_READY_POLL_ATTEMPTS; attempt += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ANALYTICS_READY_POLL_INTERVAL_MS)
    })
    if (isAnalyticsRuntimeReady()) {
      return true
    }
  }

  return false
}

export function isAnalyticsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (isAnalyticsProviderDisabled(env.NEXT_PUBLIC_ANALYTICS_PROVIDER)) {
    return false
  }

  const explicitEnabled = parseBooleanEnv(env.NEXT_PUBLIC_ANALYTICS_ENABLED)
  if (explicitEnabled !== null) {
    return explicitEnabled
  }

  return false
}

export async function trackEvent(
  eventName: string,
  properties?: AnalyticsEventProperties
): Promise<void> {
  if (!isAnalyticsEnabled()) {
    return
  }

  if (typeof window === "undefined") {
    return
  }

  if (!runtimeInitialized || !cachedTrack) {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          if (!cachedTrack || !cachedInject) {
            const analyticsModule = await import("@vercel/analytics")
            cachedTrack = analyticsModule.track
            cachedInject = analyticsModule.inject
          }

          if (!runtimeInitialized && cachedInject && !runtimeInjected) {
            cachedInject({ framework: "react" })
            runtimeInjected = true
          }

          if (!runtimeInitialized) {
            runtimeInitialized = await waitForAnalyticsRuntimeReady()
            if (!runtimeInitialized) {
              // Allow a fresh inject() attempt on a later event when readiness times out.
              runtimeInjected = false
            }
          }
        } catch {
          cachedTrack = null
          cachedInject = null
          runtimeInitialized = false
          runtimeInjected = false
          throw new Error("analytics initialization failed")
        } finally {
          initPromise = null
        }
      })()
    }

    try {
      await initPromise
    } catch {
      return
    }

    if (!runtimeInitialized) {
      runtimeInitialized = isAnalyticsRuntimeReady()
    }
  }

  if (!cachedTrack || !runtimeInitialized) {
    return
  }

  const sanitizedProperties = getTrackedEventProperties(properties)
  cachedTrack(eventName, sanitizedProperties)
}

export function trackEventSafe(
  eventName: string,
  properties?: AnalyticsEventProperties
): void {
  if (!isAnalyticsEnabled()) {
    return
  }

  void trackEvent(eventName, properties).catch(() => {
    // Suppress analytics transport errors to avoid unhandled promise rejections.
  })
}

export type { AnalyticsEventProperties }
