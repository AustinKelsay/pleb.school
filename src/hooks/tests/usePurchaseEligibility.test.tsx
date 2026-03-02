// @vitest-environment jsdom

import { act, createElement, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePurchaseEligibility, type PurchaseEligibilityResult } from "@/hooks/usePurchaseEligibility"

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}))

vi.mock("next-auth/react", () => ({
  useSession: useSessionMock,
}))

const VALID_PUBKEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

function mockClaimSuccess(purchase: { amountPaid: number; priceAtPurchase: number }) {
  return {
    ok: true,
    json: async () => ({
      data: {
        purchase: {
          id: "purchase-1",
          userId: "user-1",
          resourceId: "resource-1",
          courseId: null,
          amountPaid: purchase.amountPaid,
          paymentType: "zap",
          invoice: null,
          zapReceiptId: null,
          zapReceiptJson: null,
          zapRequestJson: null,
          priceAtPurchase: purchase.priceAtPurchase,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }),
  } as Response
}

function mockClaimFailure(error = "claim failed") {
  return {
    ok: false,
    json: async () => ({ error }),
  } as Response
}

type MountOptions = {
  resourceId?: string
  priceSats: number
  viewerZapTotalSats: number
  autoClaim?: boolean
  zapReceipts?: any[]
  onAutoClaimSuccess?: (purchase: { amountPaid: number }) => void
  onAutoClaimError?: (error: string) => void
}

function mountEligibilityHook(initialOptions: MountOptions) {
  let options: MountOptions = {
    resourceId: "resource-1",
    autoClaim: true,
    ...initialOptions,
  }
  const latestResultRef: { current: PurchaseEligibilityResult | null } = { current: null }

  function Harness() {
    const result = usePurchaseEligibility({
      resourceId: options.resourceId,
      priceSats: options.priceSats,
      viewerZapTotalSats: options.viewerZapTotalSats,
      autoClaim: options.autoClaim,
      enabled: true,
      zapReceipts: options.zapReceipts,
      onAutoClaimSuccess: options.onAutoClaimSuccess,
      onAutoClaimError: options.onAutoClaimError,
    })
    useEffect(() => {
      latestResultRef.current = result
    }, [result])
    return null
  }

  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Harness))
  })

  return {
    update(next: Partial<MountOptions>) {
      options = { ...options, ...next }
      act(() => {
        root.render(createElement(Harness))
      })
    },
    getResult() {
      if (!latestResultRef.current) {
        throw new Error("Hook result not ready")
      }
      return latestResultRef.current
    },
    unmount() {
      act(() => root.unmount())
    }
  }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("usePurchaseEligibility auto-claim state transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: { user: { pubkey: VALID_PUBKEY } },
    })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("retries after a partial auto-claim and only calls success on unlock", async () => {
    const onAutoClaimSuccess = vi.fn()
    const onAutoClaimError = vi.fn()
    let phase: "partial" | "unlock" = "partial"
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (phase === "unlock") {
        return mockClaimSuccess({ amountPaid: 1_000, priceAtPurchase: 1_000 })
      }
      return mockClaimSuccess({ amountPaid: 400, priceAtPurchase: 1_000 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const mounted = mountEligibilityHook({
      priceSats: 1_000,
      viewerZapTotalSats: 1_000,
      onAutoClaimSuccess,
      onAutoClaimError,
    })

    await flushMicrotasks()
    expect(onAutoClaimSuccess).not.toHaveBeenCalled()
    expect(onAutoClaimError).not.toHaveBeenCalled()
    const callsBeforeCooldown = fetchMock.mock.calls.length

    await act(async () => {
      vi.advanceTimersByTime(4_900)
    })
    await flushMicrotasks()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeCooldown)

    phase = "unlock"
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await flushMicrotasks()

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeCooldown)
    expect(onAutoClaimSuccess).toHaveBeenCalledTimes(1)
    expect(onAutoClaimSuccess.mock.calls[0][0]?.amountPaid).toBe(1_000)
    expect(onAutoClaimError).not.toHaveBeenCalled()

    mounted.unmount()
  })

  it("keeps retrying failed auto-claims but emits only one error notification", async () => {
    const onAutoClaimSuccess = vi.fn()
    const onAutoClaimError = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(mockClaimFailure())
    vi.stubGlobal("fetch", fetchMock)

    const mounted = mountEligibilityHook({
      priceSats: 1_000,
      viewerZapTotalSats: 1_000,
      onAutoClaimSuccess,
      onAutoClaimError,
    })

    await flushMicrotasks()
    expect(onAutoClaimSuccess).not.toHaveBeenCalled()
    expect(onAutoClaimError).toHaveBeenCalledTimes(1)
    const callsAfterFirstFailure = fetchMock.mock.calls.length

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    await flushMicrotasks()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    await flushMicrotasks()

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirstFailure)
    expect(onAutoClaimError).toHaveBeenCalledTimes(1)
    expect(onAutoClaimSuccess).not.toHaveBeenCalled()

    mounted.unmount()
  })

  it("re-attempts auto-claim when resource context changes after a prior unlock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockClaimSuccess({ amountPaid: 1_000, priceAtPurchase: 1_000 }))
    vi.stubGlobal("fetch", fetchMock)

    const mounted = mountEligibilityHook({
      resourceId: "resource-1",
      priceSats: 1_000,
      viewerZapTotalSats: 1_000,
    })

    await flushMicrotasks()
    const callsAfterFirstContext = fetchMock.mock.calls.length
    expect(callsAfterFirstContext).toBeGreaterThan(0)

    mounted.update({ resourceId: "resource-2" })
    await flushMicrotasks()

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirstContext)

    mounted.unmount()
  })

  it("supports invoice-only claim payloads without defaulting to cached receipt hints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockClaimSuccess({ amountPaid: 1_000, priceAtPurchase: 1_000 }))
    vi.stubGlobal("fetch", fetchMock)

    const mounted = mountEligibilityHook({
      resourceId: "resource-1",
      priceSats: 1_000,
      viewerZapTotalSats: 1_000,
      autoClaim: false,
      zapReceipts: [
        {
          id: "stale-receipt-id",
          senderPubkey: VALID_PUBKEY,
          payerPubkeys: [VALID_PUBKEY],
          event: { id: "stale", kind: 9735, tags: [] }
        }
      ]
    })

    await flushMicrotasks()
    await act(async () => {
      await mounted.getResult().claimPurchase({
        invoice: "lnbc-current",
        paymentType: "zap",
        zapReceiptIds: [],
        zapReceiptEvents: [],
        silent: true
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, request] = fetchMock.mock.calls[0]
    const payload = JSON.parse((request as RequestInit).body as string)
    expect(payload.invoice).toBe("lnbc-current")
    expect(payload.zapReceiptIds).toEqual([])
    expect(payload.zapReceiptId).toBeUndefined()
    expect(payload.zapReceiptJson).toBeUndefined()

    mounted.unmount()
  })

  it("keeps claimPurchase callback stable when relayHints are omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockClaimSuccess({ amountPaid: 1_000, priceAtPurchase: 1_000 }))
    vi.stubGlobal("fetch", fetchMock)

    const mounted = mountEligibilityHook({
      priceSats: 1_000,
      viewerZapTotalSats: 1_000,
      autoClaim: false,
    })

    await flushMicrotasks()
    const initialClaimPurchase = mounted.getResult().claimPurchase

    mounted.update({})
    await flushMicrotasks()

    expect(mounted.getResult().claimPurchase).toBe(initialClaimPurchase)

    mounted.unmount()
  })
})
