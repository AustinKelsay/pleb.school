"use client";

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useSnstrContext } from '../contexts/snstr-context';
import { NostrEvent } from 'snstr';
import { parseBolt11Invoice } from '@/lib/bolt11';

export interface InteractionCounts {
  zaps: number;
  likes: number;
  comments: number;
  replies: number; // Direct replies only
  threadComments: number; // All thread-related comments
}

export interface ZapReceiptSummary {
  id: string;
  amountMsats: number | null;
  amountSats: number | null;
  senderPubkey: string | null;
  receiverPubkey: string | null;
  note?: string | null;
  bolt11?: string | null;
  createdAt?: number;
  event?: NostrEvent;
}

export interface ZapInsights {
  totalMsats: number;
  totalSats: number;
  averageSats: number;
  uniqueSenders: number;
  lastZapAt: number | null;
}

const MAX_STORED_ZAPS = 200;
const MAX_RECENT_ZAPS = 8;
const MAX_VIEWER_ZAPS = 200;

export const DEFAULT_ZAP_INSIGHTS: ZapInsights = {
  totalMsats: 0,
  totalSats: 0,
  averageSats: 0,
  uniqueSenders: 0,
  lastZapAt: null
};

function summarizeZapReceipt(event: NostrEvent): ZapReceiptSummary {
  const amountTag = event.tags.find((tag) => tag[0] === 'amount');
  const bolt11Tag = event.tags.find((tag) => tag[0] === 'bolt11');
  const descriptionTag = event.tags.find((tag) => tag[0] === 'description');
  const receiverTag = event.tags.find((tag) => tag[0] === 'p');

  let amountMsats: number | null = null;
  let amountSats: number | null = null;
  if (amountTag?.[1]) {
    const parsed = Number(amountTag[1]);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      amountMsats = parsed;
      amountSats = Math.max(0, Math.floor(parsed / 1000));
    }
  }

  // Fallback: derive amount from the invoice if the zap receipt does not include an amount tag.
  if (amountMsats == null && bolt11Tag?.[1]) {
    const parsedInvoice = parseBolt11Invoice(bolt11Tag[1]);
    const invoiceMsats = parsedInvoice?.amountMsats;
    if (typeof invoiceMsats === 'number' && !Number.isNaN(invoiceMsats) && invoiceMsats >= 0) {
      amountMsats = invoiceMsats;
      amountSats = Math.max(0, Math.floor(invoiceMsats / 1000));
    } else if (!parsedInvoice) {
      // Helpful for debugging providers whose invoices we can't parse.
      console.debug('summarizeZapReceipt: unable to parse bolt11 invoice for amount', {
        bolt11: bolt11Tag[1]
      });
    }
  }

  // Final safety: if we somehow have sats but not msats, backfill msats
  // so aggregate stats stay consistent.
  if (amountMsats == null && typeof amountSats === 'number') {
    amountMsats = amountSats * 1000;
  }

  let senderPubkey: string | null = null;
  let note: string | null = null;
  if (descriptionTag?.[1]) {
    const rawDescription = descriptionTag[1];
    const trimmedDescription = rawDescription.trim();

    // If the description looks like JSON, try to parse it as a zap request
    if (trimmedDescription.startsWith('{') || trimmedDescription.startsWith('[')) {
      try {
        const parsedDescription = JSON.parse(trimmedDescription);
        if (parsedDescription?.pubkey) {
          senderPubkey = String(parsedDescription.pubkey).toLowerCase();
        }
        if (typeof parsedDescription?.content === 'string' && parsedDescription.content.trim().length > 0) {
          note = parsedDescription.content.trim();
        }
      } catch {
        // Intentionally ignore invalid zap description payloads that look like JSON
      }
    } else if (trimmedDescription.length > 0) {
      // For non-JSON descriptions (e.g. some LNURL providers), treat the raw
      // description text as the note so we at least show something meaningful.
      note = trimmedDescription;
    }
  }

  const receiverPubkey = receiverTag?.[1] ? receiverTag[1].toLowerCase() : null;

  return {
    id: event.id,
    amountMsats,
    amountSats,
    senderPubkey,
    receiverPubkey,
    note,
    bolt11: bolt11Tag?.[1],
    createdAt: event.created_at,
    event
  };
}

export interface UseInteractionsOptions {
  eventId?: string;
  realtime?: boolean;
  staleTime?: number;
  enabled?: boolean; // Allow manual control
  elementRef?: React.RefObject<HTMLElement>; // For visibility tracking
  currentUserPubkey?: string; // Optional override for identifying viewer reactions
}

export interface InteractionsQueryResult {
  interactions: InteractionCounts;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  // Individual loading states for each interaction type
  isLoadingZaps: boolean;
  isLoadingLikes: boolean;
  isLoadingComments: boolean;
  // Additional methods for thread analysis
  getDirectReplies: () => number;
  getThreadComments: () => number;
  refetch?: () => void;
  hasReacted: boolean;
  userReactionEventId: string | null;
  zapInsights: ZapInsights;
  recentZaps: ZapReceiptSummary[];
  viewerZapReceipts: ZapReceiptSummary[];
  hasZappedWithLightning: boolean;
  viewerZapTotalSats: number;
}

export function useInteractions(options: UseInteractionsOptions): InteractionsQueryResult {
  const { eventId, elementRef, enabled: manualEnabled = true, currentUserPubkey: explicitPubkey } = options;
  const { subscribe } = useSnstrContext();
  const { data: session } = useSession();
  const normalizedSessionPubkey = session?.user?.pubkey?.toLowerCase();
  const currentUserPubkey = (explicitPubkey?.toLowerCase() || normalizedSessionPubkey) ?? null;
  
  const [isVisible, setIsVisible] = useState(true);
  const [interactions, setInteractions] = useState<InteractionCounts>({ 
    zaps: 0, 
    likes: 0, 
    comments: 0, 
    replies: 0, 
    threadComments: 0 
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Individual loading states for each interaction type
  const [isLoadingZaps, setIsLoadingZaps] = useState(false);
  const [isLoadingLikes, setIsLoadingLikes] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [userReactionEventId, setUserReactionEventId] = useState<string | null>(null);

  // Use refs to persist arrays across effect re-runs
  const zapsRef = useRef<NostrEvent[]>([]);
  const likesRef = useRef<NostrEvent[]>([]);
  const commentsRef = useRef<NostrEvent[]>([]);
  const seenZapsRef = useRef<Set<string>>(new Set());
  const seenLikesRef = useRef<Set<string>>(new Set());
  const seenCommentsRef = useRef<Set<string>>(new Set());
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const zapSummariesRef = useRef<ZapReceiptSummary[]>([]);
  const zapSenderTotalsRef = useRef<Map<string, { totalMsats: number; lastZapAt: number }>>(new Map());
  const unknownZapCountRef = useRef(0);
  const zapCountRef = useRef(0);
  const [zapInsights, setZapInsights] = useState<ZapInsights>(DEFAULT_ZAP_INSIGHTS);
  const [recentZaps, setRecentZaps] = useState<ZapReceiptSummary[]>([]);
  const [viewerZapReceipts, setViewerZapReceipts] = useState<ZapReceiptSummary[]>([]);
  const [hasZappedWithLightning, setHasZappedWithLightning] = useState(false);
  const [viewerZapTotalSats, setViewerZapTotalSats] = useState(0);
  const currentUserPubkeyRef = useRef<string | null>(null);
  const viewerZapReceiptsRef = useRef<ZapReceiptSummary[]>([]);

  const resetInteractionStorage = () => {
    zapsRef.current = [];
    likesRef.current = [];
    commentsRef.current = [];
    seenZapsRef.current = new Set();
    seenLikesRef.current = new Set();
    seenCommentsRef.current = new Set();
    zapSummariesRef.current = [];
    viewerZapReceiptsRef.current = [];
    zapSenderTotalsRef.current = new Map();
    unknownZapCountRef.current = 0;
    zapCountRef.current = 0;
    setUserReactionEventId(null);
    setZapInsights(DEFAULT_ZAP_INSIGHTS);
    setRecentZaps([]);
    setViewerZapReceipts([]);
    setHasZappedWithLightning(false);
    setViewerZapTotalSats(0);
  };

  useEffect(() => {
    if (!currentUserPubkey) {
      setUserReactionEventId(null);
      return;
    }

    const existingReaction = likesRef.current.find(
      (event) => event.pubkey?.toLowerCase() === currentUserPubkey
    );

    setUserReactionEventId(existingReaction ? existingReaction.id : null);
  }, [currentUserPubkey]);

  useEffect(() => {
    currentUserPubkeyRef.current = currentUserPubkey;
    if (!currentUserPubkey) {
      setHasZappedWithLightning(false);
      setViewerZapTotalSats(0);
      viewerZapReceiptsRef.current = [];
      setViewerZapReceipts([]);
      return;
    }

    let viewerZapTotal = 0;
    let viewerHasZapped = false;
    for (const zap of zapSummariesRef.current) {
      if (zap.senderPubkey && zap.senderPubkey === currentUserPubkey) {
        viewerHasZapped = true;
        viewerZapTotal += zap.amountSats ?? 0;
      }
    }

    setHasZappedWithLightning(viewerHasZapped);
    setViewerZapTotalSats(viewerZapTotal);
  }, [currentUserPubkey]);

  // Set up intersection observer for visibility-based subscription management
  useEffect(() => {
    if (!elementRef?.current) {
      setIsVisible(true); // Default to visible if no ref provided
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: '50px' // Start loading 50px before element is visible
      }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [elementRef]);

  // Main subscription effect
  useEffect(() => {
    // Only subscribe if enabled, visible, and has valid eventId
    const shouldSubscribe = manualEnabled && isVisible && eventId && eventId.length === 64;
    
    if (!shouldSubscribe) {
      // Clean up existing subscription if conditions change
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
        subscriptionRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (!eventId || eventId.length !== 64) {
        resetInteractionStorage();
        setInteractions({ zaps: 0, likes: 0, comments: 0, replies: 0, threadComments: 0 });
        setIsLoading(false);
        setIsLoadingZaps(false);
        setIsLoadingLikes(false);
        setIsLoadingComments(false);
      }
      return;
    }

    // If we already have a subscription, don't create a new one
    if (subscriptionRef.current) {
      return;
    }

    resetInteractionStorage();
    setIsLoading(true);
    setIsLoadingZaps(true);
    setIsLoadingLikes(true);
    setIsLoadingComments(true);
    setIsError(false);
    setError(null);

    // Reset arrays for new eventId
    zapsRef.current = [];
    likesRef.current = [];
    commentsRef.current = [];

    const updateCounts = () => {
      // For now, set replies and threadComments to be the same as comments
      // TODO: Implement proper NIP-10 thread parsing to differentiate
      const commentsCount = commentsRef.current.length;
      setInteractions({
        zaps: zapsRef.current.length,
        likes: likesRef.current.length,
        comments: commentsCount,
        replies: commentsCount, // For now, treating all comments as replies
        threadComments: commentsCount // For now, treating all comments as thread comments
      });
    };

    const setupSubscription = async () => {
      try {
        // Subscribe to all interaction types with a single subscription
        const subscription = await subscribe(
          [{ kinds: [9735, 7, 1], '#e': [eventId] }],
          (event: NostrEvent) => {
            // Route events to appropriate arrays based on kind
            const eventIdKey = event.id;
            switch (event.kind) {
              case 9735: // Zaps
                if (!seenZapsRef.current.has(eventIdKey)) {
                  seenZapsRef.current.add(eventIdKey);
                  zapsRef.current.push(event);
                  setIsLoadingZaps(false);
                  const zapSummary = summarizeZapReceipt(event);
                  const allZaps = [zapSummary, ...zapSummariesRef.current].slice(0, MAX_STORED_ZAPS);
                  zapSummariesRef.current = allZaps;
                  setRecentZaps(allZaps.slice(0, MAX_RECENT_ZAPS));

                  if (zapSummary.senderPubkey) {
                    const senderKey = zapSummary.senderPubkey;
                    const existingTotals =
                      zapSenderTotalsRef.current.get(senderKey) || { totalMsats: 0, lastZapAt: 0 };
                    const msatsContribution = zapSummary.amountMsats ?? 0;
                    zapSenderTotalsRef.current.set(senderKey, {
                      totalMsats: existingTotals.totalMsats + msatsContribution,
                      lastZapAt: Math.max(existingTotals.lastZapAt, zapSummary.createdAt ?? 0)
                    });

                    if (currentUserPubkeyRef.current && senderKey === currentUserPubkeyRef.current) {
                      setHasZappedWithLightning(true);
                      setViewerZapTotalSats((prev) => prev + (zapSummary.amountSats ?? 0));
                      viewerZapReceiptsRef.current = [zapSummary, ...viewerZapReceiptsRef.current].slice(0, MAX_VIEWER_ZAPS);
                      setViewerZapReceipts(viewerZapReceiptsRef.current);
                    }
                  } else {
                    // Treat zaps without a discoverable sender pubkey as
                    // unique supporters so that providers like Stacker News
                    // still increment the supporter count.
                    unknownZapCountRef.current += 1;
                  }

                  zapCountRef.current += 1;
                  const msatsContribution = zapSummary.amountMsats ?? 0;
                  setZapInsights((prev) => {
                    const updatedTotalMsats = prev.totalMsats + msatsContribution;
                    const zapCount = zapCountRef.current;
                    const updatedAverage = zapCount > 0 ? Math.max(0, Math.floor(updatedTotalMsats / zapCount / 1000)) : 0;
                    const previousTimestamp = prev.lastZapAt ?? null;
                    const candidateTimestamp = zapSummary.createdAt ?? previousTimestamp;
                    const resolvedTimestamp =
                      zapSummary.createdAt && previousTimestamp
                        ? Math.max(zapSummary.createdAt, previousTimestamp)
                        : candidateTimestamp;
                    const supporterCount =
                      zapSenderTotalsRef.current.size + unknownZapCountRef.current;
                    return {
                      totalMsats: updatedTotalMsats,
                      totalSats: Math.max(0, Math.floor(updatedTotalMsats / 1000)),
                      averageSats: updatedAverage,
                      uniqueSenders: supporterCount,
                      lastZapAt: resolvedTimestamp ?? null
                    };
                  });

                  updateCounts();
                }
                break;
              case 7: // Likes/Reactions
                // Accept all kind 7 reactions as likes (they are reactions/likes by definition)
                // Common formats: '+', '', '❤️', ':heart:', ':shakingeyes:', etc.
                if (!seenLikesRef.current.has(eventIdKey)) {
                  seenLikesRef.current.add(eventIdKey);
                  likesRef.current.push(event);
                  setIsLoadingLikes(false);
                  if (currentUserPubkey && event.pubkey?.toLowerCase() === currentUserPubkey) {
                    setUserReactionEventId(eventIdKey);
                  }
                  updateCounts();
                }
                break;
              case 1: // Comments
                if (!seenCommentsRef.current.has(eventIdKey)) {
                  seenCommentsRef.current.add(eventIdKey);
                  commentsRef.current.push(event);
                  setIsLoadingComments(false);
                  updateCounts();
                }
                break;
            }
          }
        );

        subscriptionRef.current = subscription;

        // Give subscription time to receive initial data
        setTimeout(() => {
          setIsLoadingZaps(false);
          setIsLoadingLikes(false);
          setIsLoadingComments(false);
          setIsLoading(false);
        }, 5000); // Wait 5 seconds for initial data

        // Dynamic timeout based on visibility
        // If not visible for 30 seconds, close the subscription
        if (!isVisible) {
          timeoutRef.current = setTimeout(() => {
            if (subscriptionRef.current && !isVisible) {
              subscriptionRef.current.close();
              subscriptionRef.current = null;
            }
          }, 30000);
        }

      } catch (err) {
        console.error('Error setting up subscription:', err);
        setIsError(true);
        setError(err as Error);
        setIsLoading(false);
        setIsLoadingZaps(false);
        setIsLoadingLikes(false);
        setIsLoadingComments(false);
      }
    };

    setupSubscription();

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
        subscriptionRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [eventId, subscribe, manualEnabled, isVisible, currentUserPubkey]);

  const getDirectReplies = () => {
    return interactions.replies;
  };

  const getThreadComments = () => {
    return interactions.threadComments;
  };

  const refetch = () => {
    // Close existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
      subscriptionRef.current = null;
    }
    
    // Reset data
    resetInteractionStorage();
    setInteractions({ zaps: 0, likes: 0, comments: 0, replies: 0, threadComments: 0 });

    // Force re-run of the effect
    setIsLoading(true);
  };

  return {
    interactions,
    isLoading,
    isError,
    error,
    // Individual loading states for each interaction type
    isLoadingZaps,
    isLoadingLikes,
    isLoadingComments,
    // Additional methods for thread analysis
    getDirectReplies,
    getThreadComments,
    refetch,
    hasReacted: Boolean(userReactionEventId),
    userReactionEventId,
    zapInsights,
    recentZaps,
    viewerZapReceipts,
    hasZappedWithLightning,
    viewerZapTotalSats
  };
}
