"use client";

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  createZapRequest,
  fetchLnurlPayMetadata,
  getEventHash,
  getPublicKey,
  generateKeypair,
  signEvent,
  supportsNostrZaps,
  type LnurlPayResponse,
  type NostrEvent
} from 'snstr';

import { useSnstrContext } from '@/contexts/snstr-context';
import { isNip07User } from '@/lib/nostr-events';
import { deriveLnurlDetails, msatsToSats, truncateToByteLength, type LnurlDetails } from '@/lib/lightning';
import { normalizeHexPrivkey, normalizeHexPubkey } from '@/lib/nostr-keys';
import { parseBolt11Invoice } from '@/lib/bolt11';
import { useNostr } from '@/hooks/useNostr';
import type { LightningRecipient, ZapSendResult } from '@/types/zap';

interface SendZapArgs {
  amountSats: number;
  note?: string;
}

interface UseZapSenderOptions {
  eventId?: string;
  eventKind?: number;
  eventIdentifier?: string;
  eventPubkey?: string;
  zapTarget?: LightningRecipient;
}

type ZapStatus =
  | 'idle'
  | 'resolving'
  | 'signing'
  | 'requesting-invoice'
  | 'invoice-ready'
  | 'paying'
  | 'success'
  | 'error';

export interface ZapState {
  status: ZapStatus;
  metadata?: LnurlPayResponse;
  lnurlDetails?: LnurlDetails | null;
  zapRequest?: NostrEvent;
  invoice?: string;
  error?: string;
  paid?: boolean;
  paymentPreimage?: string;
  weblnError?: string;
}

interface ZapSenderHook {
  sendZap: (args: SendZapArgs) => Promise<ZapSendResult>;
  retryWeblnPayment: () => Promise<boolean>;
  resetZapState: () => void;
  zapState: ZapState;
  isZapInFlight: boolean;
  minZapSats?: number | null;
  maxZapSats?: number | null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function attemptWeblnPayment(invoice: string): Promise<{ ok: boolean; preimage?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { ok: false };
  }
  const webln = window.webln;
  if (!webln?.sendPayment) {
    return { ok: false };
  }

  try {
    if (webln.enable) {
      await webln.enable();
    }
    const result = await webln.sendPayment(invoice);
    return { ok: true, preimage: result?.preimage };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildATag(eventKind?: number, eventPubkey?: string, eventIdentifier?: string): string | undefined {
  if (!eventKind || eventKind < 30000) {
    return undefined;
  }
  if (!eventPubkey || !eventIdentifier) {
    return undefined;
  }
  return `${eventKind}:${eventPubkey}:${eventIdentifier}`;
}

export function useZapSender(options: UseZapSenderOptions): ZapSenderHook {
  const { eventId, eventKind, eventIdentifier, eventPubkey, zapTarget } = options;
  const { relays } = useSnstrContext();
  const { data: session, status: sessionStatus } = useSession();
  const { fetchProfile, normalizeKind0 } = useNostr();
  const [zapState, setZapState] = useState<ZapState>({ status: 'idle' });
  const metadataCacheRef = useRef<Record<string, LnurlPayResponse>>({});
  const profileCacheRef = useRef<Record<string, { lightningAddress?: string; lnurl?: string }>>({});
  const anonymousKeysRef = useRef<{ pubkey: string; privkey: string } | null>(null);

  const normalizedRecipientPubkey = useMemo(() => {
    return normalizeHexPubkey(zapTarget?.pubkey || eventPubkey);
  }, [zapTarget?.pubkey, eventPubkey]);

  const normalizedSessionPubkey = useMemo(() => normalizeHexPubkey(session?.user?.pubkey), [session?.user?.pubkey]);
  // session?.user?.privkey is only set for ephemeral/session-scoped keys
  // (anonymous, email, GitHub flows) and never long-term identity keys;
  // long-lived keys use NIP-07 (see isNip07User and src/lib/auth.ts around lines 638–643).
  const normalizedSessionPrivkey = useMemo(() => normalizeHexPrivkey(session?.user?.privkey), [session?.user?.privkey]);
  const canServerSign = Boolean(normalizedSessionPrivkey) && !isNip07User(session?.provider);

  const minZapSats = useMemo(() => msatsToSats(zapState.metadata?.minSendable), [zapState.metadata?.minSendable]);
  const maxZapSats = useMemo(() => msatsToSats(zapState.metadata?.maxSendable), [zapState.metadata?.maxSendable]);

  const isZapInFlight = ['resolving', 'signing', 'requesting-invoice', 'paying'].includes(zapState.status);

  const resetZapState = useCallback(() => {
    setZapState({ status: 'idle' });
  }, []);

  const createSignedZapRequest = useCallback(
    async (
      amountMsats: number,
      lnurl: string,
      lnurlDetails: LnurlDetails,
      note: string,
      senderPubkeyHint?: string
    ): Promise<{ event: NostrEvent; signerPubkey: string }> => {
      const aTag = buildATag(eventKind, normalizedRecipientPubkey || eventPubkey, eventIdentifier);
      const relayHints = zapTarget?.relayHints || [];
      const relayList = Array.from(new Set([...(relayHints || []), ...relays]));

      let signerPubkey = senderPubkeyHint || normalizedSessionPubkey || null;
      let signerPrivkey: string | null = null;

      if (canServerSign && normalizedSessionPrivkey && !signerPubkey) {
        signerPubkey = normalizeHexPubkey(getPublicKey(normalizedSessionPrivkey));
        signerPrivkey = normalizedSessionPrivkey;
      }

      const nostrExtension = typeof window !== 'undefined' ? (window as Window & { nostr?: any }).nostr : undefined;

      // If no session key and no hint, allow anonymous local signing for guests.
      if (!signerPubkey && !nostrExtension?.getPublicKey) {
        if (!anonymousKeysRef.current) {
          const keys = await generateKeypair();
          if (keys?.publicKey && keys?.privateKey) {
            const normalizedPubkey = normalizeHexPubkey(keys.publicKey);
            const normalizedPrivkey = normalizeHexPrivkey(keys.privateKey);
            if (normalizedPubkey && normalizedPrivkey) {
              anonymousKeysRef.current = {
                pubkey: normalizedPubkey,
                privkey: normalizedPrivkey
              };
            }
          }
        }
        signerPubkey = anonymousKeysRef.current?.pubkey || null;
        signerPrivkey = anonymousKeysRef.current?.privkey || null;
      }

      if (!signerPubkey) {
        if (!nostrExtension?.getPublicKey) {
          throw new Error('Connect a Nostr extension to zap this content.');
        }
        const extensionPubkey = normalizeHexPubkey(await nostrExtension.getPublicKey());
        if (!extensionPubkey) {
          throw new Error('The connected Nostr extension returned an invalid public key.');
        }
        signerPubkey = extensionPubkey;
      }

      const zapRequestTemplate = createZapRequest(
        {
          recipientPubkey: normalizedRecipientPubkey || eventPubkey || '',
          eventId,
          amount: amountMsats,
          relays: relayList,
          content: note,
          lnurl,
          aTag
        },
        signerPubkey
      );

      if (canServerSign && normalizedSessionPrivkey) {
        const unsignedEvent = {
          ...zapRequestTemplate,
          pubkey: signerPubkey,
          created_at: zapRequestTemplate.created_at ?? Math.floor(Date.now() / 1000),
          tags: zapRequestTemplate.tags ?? []
        };
        const zapId = await getEventHash(unsignedEvent);
        const zapSig = await signEvent(zapId, normalizedSessionPrivkey);
        return {
          event: { ...unsignedEvent, id: zapId, sig: zapSig },
          signerPubkey
        };
      }

      if (signerPrivkey) {
        const unsignedEvent = {
          ...zapRequestTemplate,
          pubkey: signerPubkey,
          created_at: zapRequestTemplate.created_at ?? Math.floor(Date.now() / 1000),
          tags: zapRequestTemplate.tags ?? []
        };
        const zapId = await getEventHash(unsignedEvent);
        const zapSig = await signEvent(zapId, signerPrivkey);
        return { event: { ...unsignedEvent, id: zapId, sig: zapSig }, signerPubkey };
      }

      if (!nostrExtension?.signEvent || !nostrExtension?.getPublicKey) {
        throw new Error('Connect a Nostr (NIP-07) extension to zap content.');
      }

      const signed = await nostrExtension.signEvent(zapRequestTemplate);
      return { event: signed, signerPubkey };
    },
    [
      canServerSign,
      eventId,
      eventIdentifier,
      eventKind,
      eventPubkey,
      normalizedRecipientPubkey,
      normalizedSessionPrivkey,
      normalizedSessionPubkey,
      relays,
      zapTarget?.relayHints
    ]
  );

  const sendZap = useCallback(
    async ({ amountSats, note = '' }: SendZapArgs): Promise<ZapSendResult> => {
      try {
        if (!zapTarget) {
          throw new Error('No lightning recipient available for this content.');
        }
        if (!normalizedRecipientPubkey && !eventPubkey) {
          throw new Error('Recipient pubkey is missing, so zaps are disabled for this content.');
        }
        if (sessionStatus === 'loading') {
          throw new Error('Still loading your session. Try again in a moment.');
        }

        const profileCacheKey = (normalizedRecipientPubkey || eventPubkey || '').toLowerCase();
        let resolvedLightningAddress = zapTarget.lightningAddress?.trim() || undefined;
        let resolvedLnurl = zapTarget.lnurl?.trim() || undefined;

        if (!resolvedLightningAddress && !resolvedLnurl && profileCacheKey) {
          const cachedProfile = profileCacheRef.current[profileCacheKey];
          if (cachedProfile) {
            resolvedLightningAddress = cachedProfile.lightningAddress || resolvedLightningAddress;
            resolvedLnurl = cachedProfile.lnurl || resolvedLnurl;
          } else {
            try {
              const profileEvent = await fetchProfile(profileCacheKey);
              const normalizedProfile = normalizeKind0(profileEvent);
              const profileLightning = normalizedProfile?.lud16?.trim();
              const profileLnurl = normalizedProfile?.lud06?.trim();
              profileCacheRef.current[profileCacheKey] = {
                lightningAddress: profileLightning || undefined,
                lnurl: profileLnurl || undefined
              };
              resolvedLightningAddress = profileLightning || resolvedLightningAddress;
              resolvedLnurl = profileLnurl || resolvedLnurl;
            } catch (profileError) {
              console.warn('useZapSender: unable to fetch profile for zap target', profileError);
            }
          }
        }

        const lnurlDetails = deriveLnurlDetails({
          ...zapTarget,
          lightningAddress: resolvedLightningAddress,
          lnurl: resolvedLnurl,
          pubkey: zapTarget.pubkey || normalizedRecipientPubkey || eventPubkey
        });

        if (!lnurlDetails) {
          throw new Error('Lightning address is missing or invalid.');
        }

        setZapState({ status: 'resolving', lnurlDetails });

        const metadataCacheKey = lnurlDetails.endpointUrl;
        let metadata: LnurlPayResponse | null | undefined = metadataCacheRef.current[metadataCacheKey];

        if (!metadata) {
          metadata = await fetchLnurlPayMetadata(lnurlDetails.fetchInput || lnurlDetails.lnurlBech32);
          if (!metadata) {
            throw new Error('Unable to fetch LNURL metadata for this creator.');
          }
          metadataCacheRef.current[metadataCacheKey] = metadata;
        }

        if (!supportsNostrZaps(metadata)) {
          throw new Error('This lightning wallet does not support Nostr zaps yet.');
        }

        const amountMsats = amountSats * 1000;
        if (amountMsats < metadata.minSendable || amountMsats > metadata.maxSendable) {
          const minSats = Math.ceil(metadata.minSendable / 1000);
          const maxSats = Math.floor(metadata.maxSendable / 1000);
          throw new Error(`Choose an amount between ${minSats.toLocaleString()} and ${maxSats.toLocaleString()} sats.`);
        }

        const trimmedNote = note.trim().slice(0, 280);
        const lnurlComment = metadata.commentAllowed && metadata.commentAllowed > 0
          ? truncateToByteLength(trimmedNote, metadata.commentAllowed)
          : '';

        setZapState({ status: 'signing', metadata, lnurlDetails });

        const { event: signedZapRequest } = await createSignedZapRequest(
          amountMsats,
          lnurlDetails.lnurlBech32,
          lnurlDetails,
          trimmedNote
        );

        setZapState({ status: 'requesting-invoice', metadata, lnurlDetails, zapRequest: signedZapRequest });

        const zapRequestJson = JSON.stringify(signedZapRequest);
        const zapRequestHash = await sha256Hex(zapRequestJson);

        const callbackUrl = new URL(metadata.callback);
        callbackUrl.searchParams.set('amount', amountMsats.toString());
        callbackUrl.searchParams.set('nostr', zapRequestJson);
        callbackUrl.searchParams.set('lnurl', lnurlDetails.lnurlBech32);
        if (lnurlComment) {
          callbackUrl.searchParams.set('comment', lnurlComment);
        }

        const callbackHref = callbackUrl.toString();
        const invoiceResponse = await fetch(callbackHref);
        const invoiceJson = await invoiceResponse.json();

        if (invoiceJson.status === 'ERROR') {
          throw new Error(invoiceJson.reason || 'LNURL callback returned an error.');
        }

        if (typeof invoiceJson.pr !== 'string' || !invoiceJson.pr) {
          throw new Error('LNURL callback returned an invalid invoice.');
        }

        const invoice = invoiceJson.pr;

        const parsedInvoice = parseBolt11Invoice(invoice);
        if (parsedInvoice?.descriptionHash) {
          const invoiceHash = parsedInvoice.descriptionHash.toLowerCase();
          if (zapRequestHash.toLowerCase() !== invoiceHash) {
            // Surface full context so we can compare exactly what we hashed
            // and sent in the nostr param vs what the LNURL server used.
            console.error('useZapSender: invoice description hash does not match zap request', {
              zapRequestJson,
              zapRequestHash,
              invoiceDescriptionHash: invoiceHash,
              zapRequest: signedZapRequest,
              lnurlCallback: callbackHref,
              lnurlResponse: invoiceJson,
              parsedInvoice
            });
            throw new Error(
              'Invoice description hash does not match zap request. ' +
              'This Lightning provider is not producing NIP-57 compatible zap invoices.'
            );
          }
        }

        setZapState({
          status: 'invoice-ready',
          metadata,
          lnurlDetails,
          zapRequest: signedZapRequest,
          invoice
        });

        setZapState((prev) => ({ ...prev, status: 'paying' }));
        const weblnResult = await attemptWeblnPayment(invoice);

        if (weblnResult.ok) {
          setZapState({
            status: 'success',
            metadata,
            lnurlDetails,
            zapRequest: signedZapRequest,
            invoice,
            paid: true,
            paymentPreimage: weblnResult.preimage
          });
          return {
            invoice,
            paid: true,
            paymentPreimage: weblnResult.preimage
          };
        }

        // When WebLN is unavailable or the user declines, fall back to
        // invoice-ready so manual payment and retry controls are usable.
        setZapState((prev) => ({
          ...prev,
          status: 'invoice-ready',
          weblnError: weblnResult.error
        }));

        return {
          invoice,
          paid: false
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to send zap.';
        setZapState((prev) => ({ ...prev, status: 'error', error: message }));
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [createSignedZapRequest, eventPubkey, fetchProfile, normalizeKind0, normalizedRecipientPubkey, sessionStatus, zapTarget]
  );

  const retryWeblnPayment = useCallback(async () => {
    if (!zapState.invoice) {
      return false;
    }
    setZapState((prev) => ({ ...prev, status: 'paying', error: undefined }));
    const result = await attemptWeblnPayment(zapState.invoice);
    if (result.ok) {
      setZapState((prev) => ({
        ...prev,
        status: 'success',
        paid: true,
        paymentPreimage: result.preimage
      }));
      return true;
    }
    setZapState((prev) => ({
      ...prev,
      status: 'invoice-ready',
      error: result.error,
      weblnError: result.error
    }));
    return false;
  }, [zapState.invoice]);

  return {
    sendZap,
    retryWeblnPayment,
    resetZapState,
    zapState,
    isZapInFlight,
    minZapSats,
    maxZapSats
  };
}
