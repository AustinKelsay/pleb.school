import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import rehypeHighlight from 'rehype-highlight'
import { describe, expect, it } from 'vitest'

import { MarkdownRenderer, hasFencedCodeBlocks } from '@/components/ui/markdown-renderer'
import {
  BASE_REHYPE_PLUGINS,
  MarkdownRendererInner,
} from '@/components/ui/markdown-renderer-core'

describe('MarkdownRenderer', () => {
  it('detects fenced code blocks', () => {
    expect(hasFencedCodeBlocks('Plain text only')).toBe(false)
    expect(hasFencedCodeBlocks('```ts\nconst a = 1\n```')).toBe(true)
  })

  it('renders plain markdown without highlight.js classes', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, { content: '# Plain Markdown' })
    )

    expect(html).not.toContain('hljs')
  })

  it('applies highlight classes when rendering fenced code', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRendererInner, {
        content: '```ts\nconst answer = 42\n```',
        rehypePlugins: [...BASE_REHYPE_PLUGINS, rehypeHighlight],
      })
    )

    expect(html).toContain('hljs')
    expect(html).toContain('language-ts')
  })
})
