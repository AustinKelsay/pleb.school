'use client'

import { useInteractions, UseInteractionsOptions } from './useInteractions'

export interface CommentMetrics {
  totalComments: number      // All comments in thread (backward compatible)
  directReplies: number      // Only direct replies to the content
  threadDiscussion: number   // All thread-related comments
}

export interface CommentThreadsQueryResult {
  commentMetrics: CommentMetrics
  interactions: ReturnType<typeof useInteractions>['interactions']
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch?: () => void
  getDirectReplies: () => number
  getThreadComments: () => number
  hasReacted: boolean
  userReactionEventId: string | null
  zapInsights: ReturnType<typeof useInteractions>['zapInsights']
  recentZaps: ReturnType<typeof useInteractions>['recentZaps']
  hasZappedWithLightning: ReturnType<typeof useInteractions>['hasZappedWithLightning']
  viewerZapTotalSats: ReturnType<typeof useInteractions>['viewerZapTotalSats']
  viewerZapReceipts: ReturnType<typeof useInteractions>['viewerZapReceipts']
}

/**
 * Hook for accessing enhanced comment metrics with NIP-10 thread parsing
 * This is a wrapper around useInteractions that provides comment-specific metrics
 */
export function useCommentThreads(
  eventId?: string, 
  options: Omit<UseInteractionsOptions, 'eventId' | 'realtime'> = {}
): CommentThreadsQueryResult {
  const { 
    interactions, 
    isLoading, 
    isError,
    error, 
    refetch,
    getDirectReplies, 
    getThreadComments,
    hasReacted,
    userReactionEventId,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats,
    viewerZapReceipts
  } = useInteractions({
    eventId,
    realtime: false,
    ...options
  })

  const commentMetrics: CommentMetrics = {
    totalComments: interactions.comments,        // Backward compatible
    directReplies: interactions.replies,         // Direct replies only
    threadDiscussion: interactions.threadComments // All thread comments
  }

  return {
    commentMetrics,
    interactions,
    isLoading,
    isError,
    error,
    refetch,
    getDirectReplies,
    getThreadComments,
    hasReacted,
    userReactionEventId,
    zapInsights,
    recentZaps,
    hasZappedWithLightning,
    viewerZapTotalSats,
    viewerZapReceipts
  }
}

/**
 * Helper function to format comment counts for display
 */
export function formatCommentCount(count: number): string {
  if (count === 0) return '0'
  if (count === 1) return '1'
  if (count < 1000) return count.toString()
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1000000).toFixed(1)}m`
}

/**
 * Helper function to get appropriate comment label
 */
export function getCommentLabel(count: number, includeReplies = false): string {
  if (count === 0) return includeReplies ? 'No replies' : 'No comments'
  if (count === 1) return includeReplies ? '1 reply' : '1 comment'
  return includeReplies ? `${formatCommentCount(count)} replies` : `${formatCommentCount(count)} comments`
}
