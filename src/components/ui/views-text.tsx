"use client"

import * as React from "react"
import { useViews } from "@/hooks/useViews"

type Notation = "standard" | "compact"

export interface ViewsTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  ns?: string
  id?: string
  keyOverride?: string
  notation?: Notation
  label?: boolean
  track?: boolean
  dedupe?: "session" | "day" | false
  enabled?: boolean
  count?: number | null
}

function formatCount(count: number | null | undefined, notation: Notation) {
  const value = typeof count === "number" ? count : 0
  return new Intl.NumberFormat(undefined, {
    notation: notation === "compact" ? "compact" : undefined,
    maximumFractionDigits: 1,
  }).format(value)
}

function StaticViewsText({
  notation = "standard",
  label = true,
  count,
  className,
  ...rest
}: ViewsTextProps) {
  const formatted = React.useMemo(
    () => formatCount(count, notation),
    [count, notation]
  )

  return (
    <span className={className} {...rest}>
      {formatted}
      {label ? " views" : null}
    </span>
  )
}

function TrackedViewsText({
  ns,
  id,
  keyOverride,
  notation = "standard",
  label = true,
  enabled = true,
  track = true,
  dedupe = "session",
  className,
  ...rest
}: Omit<ViewsTextProps, "count">) {
  const { count } = useViews({ ns, id, key: keyOverride, track, dedupe, enabled })

  const formatted = React.useMemo(() => formatCount(count, notation), [count, notation])

  return (
    <span className={className} {...rest}>
      {formatted}
      {label ? " views" : null}
    </span>
  )
}

export function ViewsText(props: ViewsTextProps) {
  if (Object.prototype.hasOwnProperty.call(props, "count")) {
    return <StaticViewsText {...props} />
  }

  return <TrackedViewsText {...props} />
}
