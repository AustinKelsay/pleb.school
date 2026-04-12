export type EventPriorityConfig = Readonly<Record<number, number>>

interface PrioritizedEvent {
  created_at: number
  kind: number
}

export function getEventPriority(
  config: EventPriorityConfig,
  kind: number
): number {
  return config[kind] ?? 0
}

export function selectPreferredEventByPriority<T extends PrioritizedEvent>(
  existing: T | undefined,
  candidate: T,
  config: EventPriorityConfig
): T {
  if (!existing) {
    return candidate
  }

  if (candidate.created_at > existing.created_at) {
    return candidate
  }

  if (candidate.created_at < existing.created_at) {
    return existing
  }

  return getEventPriority(config, candidate.kind) > getEventPriority(config, existing.kind)
    ? candidate
    : existing
}

export function selectPreferredEventFromList<T extends PrioritizedEvent>(
  events: T[],
  config: EventPriorityConfig
): T | null {
  if (events.length === 0) {
    return null
  }

  return events.slice(1).reduce(
    (selected, candidate) => selectPreferredEventByPriority(selected, candidate, config),
    events[0]
  )
}
