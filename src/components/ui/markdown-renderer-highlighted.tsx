'use client'

import React from 'react'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

import {
  BASE_REHYPE_PLUGINS,
  MarkdownRendererInner,
  type MarkdownRendererProps,
} from './markdown-renderer-core'

export default function MarkdownRendererHighlighted(props: MarkdownRendererProps) {
  return (
    <MarkdownRendererInner
      {...props}
      rehypePlugins={[...BASE_REHYPE_PLUGINS, rehypeHighlight]}
    />
  )
}
