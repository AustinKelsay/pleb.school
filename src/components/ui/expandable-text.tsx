'use client'

import React, { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ExpandableTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string
  collapsedHeight?: number
  textClassName?: string
  buttonClassName?: string
  expandLabel?: string
  collapseLabel?: string
}

export function ExpandableText({
  text,
  collapsedHeight = 240,
  className,
  textClassName,
  buttonClassName,
  expandLabel = 'Read more',
  collapseLabel = 'Show less',
  ...props
}: ExpandableTextProps) {
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const element = contentRef.current
    if (!element) return

    const measureOverflow = () => {
      setIsOverflowing(element.scrollHeight > collapsedHeight + 1)
    }

    measureOverflow()

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureOverflow)
      : null

    resizeObserver?.observe(element)
    window.addEventListener('resize', measureOverflow)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measureOverflow)
    }
  }, [collapsedHeight, text])

  useEffect(() => {
    if (!isOverflowing && expanded) {
      setExpanded(false)
    }
  }, [expanded, isOverflowing])

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="relative">
        <p
          ref={contentRef}
          className={cn(
            'whitespace-pre-line transition-[max-height] duration-200 ease-out',
            !expanded && isOverflowing && 'overflow-hidden',
            textClassName
          )}
          style={!expanded && isOverflowing ? { maxHeight: collapsedHeight } : undefined}
        >
          {text}
        </p>

        {!expanded && isOverflowing && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/90 to-transparent"
          />
        )}
      </div>

      {isOverflowing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-auto px-0 text-sm font-medium text-primary hover:bg-transparent hover:text-primary/80',
            buttonClassName
          )}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? collapseLabel : expandLabel}
        </Button>
      )}
    </div>
  )
}
