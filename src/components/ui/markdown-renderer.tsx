/**
 * High-performance markdown renderer with comprehensive syntax highlighting
 *
 * Uses react-markdown with plugins for GitHub-flavored markdown, raw HTML support,
 * and optimized rendering with memoization for better performance.
 *
 * Security: Content is sanitized via DOMPurify before rendering to remove XSS vectors
 * (script tags, event handlers, dangerous URLs). rehypeRaw then safely passes through
 * the sanitized HTML for rich content embedding (videos, iframes, custom formatting).
 * Additional protections: Link handler blocks dangerous URL schemes (javascript:, data:,
 * vbscript:). Image handler uses OptimizedImage with filtered props.
 */

'use client'

import React, { useState, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ExternalLink, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeContent } from '@/lib/content-utils'

// Import highlight.js theme for syntax highlighting
import 'highlight.js/styles/github-dark.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

interface TaskListItemProps {
  checked?: boolean
  children?: React.ReactNode
}

const BLOCK_LANGUAGE_FALLBACK = 'text'

const flattenText = (node: React.ReactNode): string => {
  if (node === null || node === undefined) {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(flattenText).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return flattenText(node.props?.children)
  }
  return ''
}

/**
 * Enhanced code block component with copy functionality and line numbers
 */
const CodeBlock = memo(function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false)
  const codeContent = useMemo(() => flattenText(children).replace(/\n$/, ''), [children])
  const lines = useMemo(() => codeContent.split('\n'), [codeContent])
  const hasMultipleLines = lines.length > 1
  const childArray = React.Children.toArray(children)
  const codeElement = childArray.find((child) => React.isValidElement(child)) as React.ReactElement<React.HTMLAttributes<HTMLElement>> | undefined
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Copy failed:', err)
    }
  }
  
  const resolvedLanguage =
    (typeof className === 'string' && className.match(/language-([\w-]+)/)?.[1]) ||
    (typeof codeElement?.props?.className === 'string' && codeElement.props.className.match(/language-([\w-]+)/)?.[1]) ||
    (typeof className === 'string' && className.replace(/^(hljs\s+)/, '').trim()) ||
    BLOCK_LANGUAGE_FALLBACK
  const languageLabel = (resolvedLanguage || BLOCK_LANGUAGE_FALLBACK).toLowerCase()

  const highlightedCode = codeElement
    ? React.cloneElement(codeElement, {
        ...codeElement.props,
        className: cn('font-mono flex-1 min-w-0', codeElement.props.className),
      })
    : <code className="font-mono">{children}</code>

  return (
    <div className="relative mb-4 group w-full">
      <div className="flex items-center justify-between bg-muted border rounded-t-lg px-3 sm:px-4 py-2">
        <Badge variant="secondary" className="text-xs font-mono">
          {languageLabel}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          title="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <div className="bg-[#0d1117] border border-t-0 rounded-b-lg overflow-hidden w-full">
        {hasMultipleLines ? (
          <div className="flex min-w-0">
            <div className="select-none pr-2 sm:pr-4 text-gray-500 font-mono text-right min-w-[1.5rem] sm:min-w-[2rem] flex-shrink-0 py-3 sm:py-4">
              {lines.map((_, i) => (
                <div key={i} className="text-xs sm:text-sm">{i + 1}</div>
              ))}
            </div>
            <pre
              className={cn('p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm leading-relaxed flex-1 min-w-0', className)}
              {...props}
            >
              {highlightedCode}
            </pre>
          </div>
        ) : (
          <pre
            className={cn('p-3 sm:p-4 overflow-x-auto text-xs sm:text-sm leading-relaxed', className)}
            {...props}
          >
            {highlightedCode}
          </pre>
        )}
      </div>
    </div>
  )
})

const InlineCode = memo(function InlineCode({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        'bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground border',
        className
      )}
      {...props}
    >
      {children}
    </code>
  )
})

/**
 * Task list item component for GitHub-flavored markdown
 */
const TaskListItem = memo(function TaskListItem({ checked, children, ...props }: TaskListItemProps & React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li className="flex items-start gap-2 text-foreground leading-relaxed list-none" {...props}>
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mt-1 rounded border-border"
      />
      <span className={checked ? 'line-through text-muted-foreground' : ''}>
        {children}
      </span>
    </li>
  )
})

/**
 * Custom components for markdown rendering
 */
const MarkdownComponents = {
  // Custom heading renderer with mobile-optimized sizes
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 mt-6 sm:mt-8 first:mt-0 text-foreground border-b border-border pb-2" {...props}>
      {children}
    </h1>
  ),
  
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-3 mt-4 sm:mt-6 text-foreground border-b border-border pb-1" {...props}>
      {children}
    </h2>
  ),
  
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-lg sm:text-xl font-semibold mb-2 mt-4 sm:mt-5 text-foreground" {...props}>
      {children}
    </h3>
  ),
  
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="text-base sm:text-lg font-semibold mb-2 mt-3 sm:mt-4 text-foreground" {...props}>
      {children}
    </h4>
  ),
  
  h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="text-sm sm:text-base font-semibold mb-1 mt-2 sm:mt-3 text-foreground" {...props}>
      {children}
    </h5>
  ),
  
  h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6 className="text-xs sm:text-sm font-semibold mb-1 mt-2 text-foreground" {...props}>
      {children}
    </h6>
  ),
  
  // Custom paragraph renderer with mobile-optimized spacing
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 sm:mb-4 text-sm sm:text-base text-foreground leading-relaxed" {...props}>
      {children}
    </p>
  ),
  
  // Custom code renderers
  code: ({ inline, node, className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean; node?: unknown }) => {
    // Destructure non-DOM props to prevent React warnings
    const { dataIndex, dataSourcePos, index, parent, sourcePosition, ...domProps } = props as Record<string, unknown>
    
    if (inline) {
      return (
        <InlineCode className={className} {...(domProps as React.HTMLAttributes<HTMLElement>)}>
          {children}
        </InlineCode>
      )
    }
    
    return (
      <code className={cn('font-mono', className)} {...(domProps as React.HTMLAttributes<HTMLElement>)}>
        {children}
      </code>
    )
  },
  
  pre: ({ children, className, node, ...props }: React.HTMLAttributes<HTMLPreElement> & { node?: unknown }) => {
    // Destructure non-DOM props to prevent React warnings
    const { dataIndex, dataSourcePos, index, parent, sourcePosition, inline, ...domProps } = props as Record<string, unknown>
    
    return (
      <CodeBlock className={className} {...(domProps as React.HTMLAttributes<HTMLPreElement>)}>
        {children}
      </CodeBlock>
    )
  },
  
  // Custom list renderers with task list support
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => {
    // Check if this is a task list
    const isTaskList = React.Children.toArray(children).some((child) => {
      if (React.isValidElement(child) && child.props) {
        const childElement = child as React.ReactElement<{ children: React.ReactNode }>
        return React.Children.toArray(childElement.props.children).some((grandChild) => 
          React.isValidElement(grandChild) && grandChild.props && 
          (grandChild.props as Record<string, unknown>).type === 'checkbox'
        )
      }
      return false
    })
    
    return (
      <ul className={`mb-4 space-y-1 text-foreground ${
        isTaskList ? 'ml-0' : 'ml-6 list-disc'
      }`} {...props}>
        {children}
      </ul>
    )
  },
  
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-4 ml-6 list-decimal space-y-1 text-foreground" {...props}>
      {children}
    </ol>
  ),
  
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => {
    // Check if this is a task list item
    const isTaskItem = React.Children.toArray(children).some((child) => 
      React.isValidElement(child) && child.props && 
      (child.props as Record<string, unknown>).type === 'checkbox'
    )
    
    if (isTaskItem) {
      const checkbox = React.Children.toArray(children).find((child) => 
        React.isValidElement(child) && child.props && 
        (child.props as Record<string, unknown>).type === 'checkbox'
      ) as React.ReactElement<{ checked?: boolean }> | undefined
      
      const restChildren = React.Children.toArray(children).filter((child) => 
        !(React.isValidElement(child) && child.props && 
        (child.props as Record<string, unknown>).type === 'checkbox')
      )
      
      return (
        <TaskListItem checked={checkbox?.props?.checked} {...props}>
          {restChildren}
        </TaskListItem>
      )
    }
    
    return (
      <li className="text-foreground leading-relaxed" {...props}>
        {children}
      </li>
    )
  },
  
  // Task list checkbox handler
  input: ({ type, checked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
    if (type === 'checkbox') {
      return null // Handled by TaskListItem
    }
    return <input type={type} checked={checked} {...props} />
  },
  
  // Custom blockquote renderer
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground bg-muted/50 py-2 rounded-r" {...props}>
      {children}
    </blockquote>
  ),
  
  // Custom table renderers with mobile optimization
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto mb-4 w-full -mx-3 sm:mx-0">
      <div className="min-w-full px-3 sm:px-0">
        <table className="w-full border-collapse border border-border rounded-lg" {...props}>
          {children}
        </table>
      </div>
    </div>
  ),
  
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-muted" {...props}>
      {children}
    </thead>
  ),
  
  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody {...props}>
      {children}
    </tbody>
  ),
  
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="border-b border-border hover:bg-muted/50" {...props}>
      {children}
    </tr>
  ),
  
  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-2 sm:px-4 py-2 text-sm sm:text-base text-foreground" {...props}>
      {children}
    </td>
  ),
  
  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-2 sm:px-4 py-2 text-left font-semibold text-sm sm:text-base text-foreground" {...props}>
      {children}
    </th>
  ),
  
  // Custom link renderer with URL scheme validation
  a: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    // Block dangerous URL schemes (javascript:, data:, vbscript:)
    const isDangerous = href && /^(javascript|data|vbscript):/i.test(href.trim())
    const safeHref = isDangerous ? '#' : href
    const isExternal = safeHref?.startsWith('http')

    return (
      <a
        href={safeHref}
        className="text-primary hover:text-primary/80 underline underline-offset-4 inline-flex items-center gap-1"
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        {...props}
      >
        {children}
        {isExternal && <ExternalLink className="h-3 w-3" />}
      </a>
    )
  },
  
  // Custom image renderer with mobile optimization and URL scheme validation
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // Block dangerous URL schemes (javascript:, data:, vbscript:) - same as link handler
    const rawSrc = typeof src === 'string' ? src : ''
    const isDangerous = rawSrc && /^(javascript|data|vbscript):/i.test(rawSrc.trim())
    const safeSrc = isDangerous ? '' : rawSrc

    return (
    <div className="my-3 sm:my-4 w-full">
      <OptimizedImage
        src={safeSrc}
        alt={alt || ''}
        width={800}
        height={600}
        className="w-full h-auto rounded-lg border border-border"
      />
      {alt && (
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 text-center italic">
          {alt}
        </p>
      )}
    </div>
    )
  },
  
  // Custom horizontal rule
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-8 border-border" {...props} />
  ),
  
  // Custom strong/bold
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  
  // Custom emphasis/italic
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-foreground" {...props}>
      {children}
    </em>
  ),
}

/**
 * High-performance markdown renderer component with memoization
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Memoize the plugins configuration for better performance
  const remarkPlugins = useMemo(() => [remarkGfm], [])
  const rehypePlugins = useMemo(() => [
    rehypeHighlight,
    rehypeRaw
  ], [])

  // Sanitize content to remove XSS vectors before rendering
  const sanitizedContent = useMemo(() => sanitizeContent(content), [content])

  // Memoize the rendered content
  const renderedContent = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={MarkdownComponents}
    >
      {sanitizedContent}
    </ReactMarkdown>
  ), [sanitizedContent, remarkPlugins, rehypePlugins])
  
  return (
    <div className={`w-full ${className}`}>
      <div className="prose prose-slate max-w-none dark:prose-invert w-full">
        {renderedContent}
      </div>
    </div>
  )
}) 
