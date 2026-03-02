type PurchaseProgress = {
  amountPaid?: number | null
  priceAtPurchase?: number | null
}

function toPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

export function getRequiredUnlockPrice(priceSats: number, purchase?: PurchaseProgress | null): number {
  const normalizedPrice = Number.isFinite(priceSats) && priceSats > 0 ? priceSats : 0
  const snapshotPrice = toPositiveNumber(purchase?.priceAtPurchase)
  return Math.min(snapshotPrice ?? normalizedPrice, normalizedPrice)
}

export function isPurchaseUnlockedByAmount(
  priceSats: number,
  purchase?: PurchaseProgress | null,
  alreadyPurchased = false
): boolean {
  if (alreadyPurchased) return true
  if (!purchase) return false

  const amountPaid = typeof purchase.amountPaid === "number" && Number.isFinite(purchase.amountPaid)
    ? purchase.amountPaid
    : 0
  const required = getRequiredUnlockPrice(priceSats, purchase)
  return amountPaid >= required
}

export function shouldStopInvoiceClaimPolling(args: {
  isOpen: boolean
  invoice?: string | null
  isOwned: boolean
}): boolean {
  const { isOpen, invoice, isOwned } = args
  if (!isOpen) return true
  if (!invoice || !invoice.trim()) return true

  return isOwned
}

export function shouldFinalizeClaimFromResult(
  priceSats: number,
  claimed?: PurchaseProgress | null,
  alreadyPurchased = false
): boolean {
  return isPurchaseUnlockedByAmount(priceSats, claimed, alreadyPurchased)
}

export function getAutoClaimRetryDelayMs(
  cooldownUntilMs: number,
  nowMs: number = Date.now()
): number {
  if (!Number.isFinite(cooldownUntilMs) || cooldownUntilMs <= 0) {
    return 0
  }
  if (cooldownUntilMs <= nowMs) {
    return 0
  }
  return cooldownUntilMs - nowMs
}

export function shouldNotifyAutoClaimFailure(
  failureCount: number,
  hasNotifiedFailure: boolean
): boolean {
  if (hasNotifiedFailure) return false
  return Number.isFinite(failureCount) && failureCount === 1
}
