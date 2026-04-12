/* @vitest-environment jsdom */

import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchSingleEventMock = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'authenticated' }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement('a', { href }, children),
}))

vi.mock('@/hooks/useNostr', () => ({
  useNostr: () => ({ fetchSingleEvent: fetchSingleEventMock }),
}))

vi.mock('@/hooks/useProfileSummary', () => ({
  useProfileSummary: () => ({ profile: null }),
}))

vi.mock('@/hooks/useCommentThreads', () => ({
  useCommentThreads: () => ({
    commentMetrics: {
      totalComments: 0,
      directReplies: 0,
      threadDiscussion: 0,
    },
    interactions: {
      zaps: 0,
      likes: 0,
      comments: 0,
      replies: 0,
      threadComments: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
    hasReacted: false,
    userReactionEventId: null,
    zapInsights: {
      totalMsats: 0,
      totalSats: 0,
      averageSats: 0,
      uniqueSenders: 0,
      lastZapAt: null,
    },
    recentZaps: [],
    hasZappedWithLightning: false,
    viewerZapTotalSats: 0,
    viewerZapReceipts: [],
    getDirectReplies: () => 0,
    getThreadComments: () => 0,
  }),
}))

vi.mock('@/hooks/useIdleMount', () => ({
  useIdleMount: () => false,
}))

vi.mock('@/components/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) =>
    createElement('div', { 'data-testid': 'markdown' }, content),
}))

vi.mock('@/components/ui/video-player', () => ({
  VideoPlayer: () => createElement('div', { 'data-testid': 'video-player' }),
}))

vi.mock('@/components/ui/deferred-zap-threads', () => ({
  DeferredZapThreads: () => createElement('div', { 'data-testid': 'comments' }),
}))

vi.mock('@/components/ui/additional-links-card', () => ({
  AdditionalLinksCard: () => createElement('div', { 'data-testid': 'links' }),
}))

vi.mock('@/components/purchase/deferred-purchase-dialog', () => ({
  DeferredPurchaseDialog: () => null,
}))

vi.mock('@/app/content/components/resource-skeletons', () => ({
  ResourceContentViewSkeleton: () => createElement('div', { 'data-testid': 'skeleton' }),
}))

vi.mock('@/app/content/components/resource-metadata-hero', () => ({
  ResourceMetadataHero: () => createElement('div', { 'data-testid': 'hero' }),
}))

import { ResourceContentView } from '@/app/content/components/resource-content-view'

describe('ResourceContentView', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    fetchSingleEventMock.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('does not fetch resource meta when initialMeta is provided', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(ResourceContentView, {
          resourceId: '123e4567-e89b-12d3-a456-426614174000',
          initialEvent: {
            id: 'event-id',
            pubkey: 'f'.repeat(64),
            created_at: 1_700_000_000,
            kind: 30023,
            tags: [
              ['d', 'resource-id'],
              ['title', 'Test Resource'],
              ['summary', 'Summary'],
            ],
            content: '# Hello world',
            sig: '0'.repeat(128),
          },
          initialMeta: {
            resourceUser: {
              id: 'user-1',
              displayName: 'Author',
              pubkey: 'f'.repeat(64),
            },
            serverPrice: 0,
            serverPurchased: false,
            serverIsOwner: false,
            unlockedViaCourse: false,
            unlockingCourseId: null,
            resourceNoteId: 'event-id',
          },
        })
      )

      await Promise.resolve()
    })

    expect(fetchSingleEventMock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()

    act(() => root.unmount())
    container.remove()
  })
})
