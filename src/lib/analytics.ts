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
let initPromise: Promise<void> | null = null

function getTrackedEventProperties(properties?: AnalyticsEventProperties) {
  if (!properties) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined)
  ) as AnalyticsEventProperties
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

          if (!runtimeInitialized && cachedInject) {
            cachedInject({ framework: "react" })
            runtimeInitialized = typeof (window as Window & { va?: unknown }).va === "function"
          }
        } catch {
          cachedTrack = null
          cachedInject = null
          runtimeInitialized = false
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
      runtimeInitialized = typeof (window as Window & { va?: unknown }).va === "function"
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
