import { describe, expect, it } from "vitest"

import {
  getAutoClaimRetryDelayMs,
  getRequiredUnlockPrice,
  isPurchaseUnlockedByAmount,
  shouldNotifyAutoClaimFailure,
  shouldFinalizeClaimFromResult,
  shouldStopInvoiceClaimPolling
} from "@/lib/purchase-claim-flow"

describe("purchase claim flow helpers", () => {
  it("uses the lower of current price and snapshot price for unlock checks", () => {
    expect(getRequiredUnlockPrice(2_000, { priceAtPurchase: 1_500 })).toBe(1_500)
    expect(getRequiredUnlockPrice(2_000, { priceAtPurchase: 3_000 })).toBe(2_000)
  })

  it("treats partial purchases as not unlocked", () => {
    expect(
      isPurchaseUnlockedByAmount(2_000, { amountPaid: 1_000, priceAtPurchase: 2_000 }, false)
    ).toBe(false)
  })

  it("treats snapshot-covered purchases as unlocked", () => {
    expect(
      isPurchaseUnlockedByAmount(2_000, { amountPaid: 1_500, priceAtPurchase: 1_500 }, false)
    ).toBe(true)
  })

  it("keeps invoice polling active for partial purchases", () => {
    const shouldStop = shouldStopInvoiceClaimPolling({
      isOpen: true,
      invoice: "lnbc123",
      isOwned: false
    })

    expect(shouldStop).toBe(false)
  })

  it("stops invoice polling once purchase is unlocked", () => {
    const shouldStop = shouldStopInvoiceClaimPolling({
      isOpen: true,
      invoice: "lnbc123",
      isOwned: true
    })

    expect(shouldStop).toBe(true)
  })

  it("does not finalize partial claim results", () => {
    expect(
      shouldFinalizeClaimFromResult(2_000, { amountPaid: 1_000, priceAtPurchase: 2_000 }, false)
    ).toBe(false)
  })

  it("finalizes claim results only once unlock threshold is met", () => {
    expect(
      shouldFinalizeClaimFromResult(2_000, { amountPaid: 2_000, priceAtPurchase: 2_000 }, false)
    ).toBe(true)
  })

  it("returns 0 retry delay when cooldown is invalid or expired", () => {
    expect(getAutoClaimRetryDelayMs(Number.NaN, 10_000)).toBe(0)
    expect(getAutoClaimRetryDelayMs(0, 10_000)).toBe(0)
    expect(getAutoClaimRetryDelayMs(9_999, 10_000)).toBe(0)
  })

  it("returns remaining cooldown when auto-claim is still cooling down", () => {
    expect(getAutoClaimRetryDelayMs(15_000, 10_000)).toBe(5_000)
  })

  it("notifies auto-claim failures only on the first retry failure", () => {
    expect(shouldNotifyAutoClaimFailure(1, false)).toBe(true)
    expect(shouldNotifyAutoClaimFailure(2, false)).toBe(false)
    expect(shouldNotifyAutoClaimFailure(1, true)).toBe(false)
  })
})
