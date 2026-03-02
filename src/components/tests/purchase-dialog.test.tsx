/* @vitest-environment jsdom */

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const claimPurchaseMock = vi.hoisted(() => vi.fn())
const useToastState = vi.hoisted(() => ({ toast: vi.fn() }))
const useZapSenderState = vi.hoisted(() => ({
  sendZap: vi.fn(),
  retryWeblnPayment: vi.fn(),
  resetZapState: vi.fn(),
  zapState: {
    status: "invoice-ready" as const,
    invoice: "lnbc-test-invoice",
    zapRequest: { id: "zap-request-event" }
  },
  isZapInFlight: false,
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" })
}))

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => useToastState
}))

vi.mock("@/hooks/usePurchaseEligibility", () => ({
  usePurchaseEligibility: () => ({
    eligible: false,
    status: "idle",
    purchase: undefined,
    claimPurchase: claimPurchaseMock,
    error: undefined,
  })
}))

vi.mock("@/hooks/useZapSender", () => ({
  useZapSender: () => useZapSenderState,
}))

import { PurchaseDialog } from "@/components/purchase/purchase-dialog"

type ClaimResult = {
  id: string
  amountPaid: number
  paymentType: "zap"
  priceAtPurchase?: number
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function mountDialog(onPurchaseComplete?: (purchase: unknown) => void) {
  const container = document.createElement("div")
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(PurchaseDialog, {
        isOpen: true,
        onOpenChange: vi.fn(),
        priceSats: 1_000,
        title: "Test content",
        viewerZapTotalSats: 0,
        onPurchaseComplete: onPurchaseComplete as (purchase: unknown) => void,
      } as const)
    )
  })
  return {
    unmount() {
      act(() => root.unmount())
    },
  }
}

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve()
  })
}

describe("PurchaseDialog invoice polling", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    claimPurchaseMock.mockReset()
    useToastState.toast.mockReset()
    useZapSenderState.resetZapState.mockReset()
    useZapSenderState.sendZap.mockReset()
    useZapSenderState.retryWeblnPayment.mockReset()
  })

  afterEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  it("does not trigger unlock side effects after invoice claim cleanup", async () => {
    const deferred = createDeferred<ClaimResult | undefined>()
    const onPurchaseComplete: (purchase: unknown) => void = vi.fn()
    claimPurchaseMock.mockReturnValueOnce(deferred.promise)

    const { unmount } = mountDialog(onPurchaseComplete)
    await flushMicrotasks()

    expect(claimPurchaseMock).toHaveBeenCalledTimes(1)

    unmount()

    await flushMicrotasks()
    deferred.resolve({
      id: "purchase-1",
      amountPaid: 1_000,
      paymentType: "zap",
      priceAtPurchase: 1_000
    })
    await flushMicrotasks()

    expect(onPurchaseComplete).not.toHaveBeenCalled()
    expect(useToastState.toast).not.toHaveBeenCalled()
    expect(claimPurchaseMock).toHaveBeenCalledTimes(1)
  })
})
