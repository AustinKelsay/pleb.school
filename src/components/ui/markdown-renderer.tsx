'use client'

import React, { lazy, memo, Suspense } from 'react'

import {
  hasFencedCodeBlocks,
  MarkdownRendererInner,
  type MarkdownRendererProps,
} from './markdown-renderer-core'

const HighlightedMarkdownRenderer = lazy(() => import('@/components/ui/markdown-renderer-highlighted'))

export { hasFencedCodeBlocks }

export const MarkdownRenderer = memo(function MarkdownRenderer(props: MarkdownRendererProps) {
  if (!hasFencedCodeBlocks(props.content)) {
    return <MarkdownRendererInner {...props} />
  }

  return (
    <Suspense fallback={<MarkdownRendererInner {...props} />}>
      <HighlightedMarkdownRenderer {...props} />
    </Suspense>
  )
})
