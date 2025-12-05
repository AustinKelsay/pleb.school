import { useCallback, useMemo, useState } from "react"
import { getPaymentsConfig } from "@/lib/payments-config"

const paymentsConfig = getPaymentsConfig()

export const QUICK_ZAP_AMOUNTS = (paymentsConfig.zap?.quickAmounts?.length
  ? paymentsConfig.zap.quickAmounts
  : [21, 100, 500, 1000, 2100]) as number[]

export const DEFAULT_QUICK_ZAP_INDEX =
  typeof paymentsConfig.zap?.defaultQuickIndex === "number"
    ? paymentsConfig.zap.defaultQuickIndex
    : 1

export const MIN_CUSTOM_ZAP =
  typeof paymentsConfig.zap?.minCustomZap === "number" && paymentsConfig.zap.minCustomZap > 0
    ? paymentsConfig.zap.minCustomZap
    : 1

export interface UseZapFormStateOptions {
  defaultQuickAmountIndex?: number
}

export interface UseZapFormStateResult {
  selectedZapAmount: number
  customZapAmount: string
  zapNote: string
  hasCustomAmount: boolean
  customAmountInvalid: boolean
  resolvedZapAmount: number
  handleSelectQuickAmount: (amount: number) => void
  handleCustomAmountChange: (value: string) => void
  setZapNote: (value: string) => void
  resetForm: () => void
}

export function useZapFormState(options: UseZapFormStateOptions = {}): UseZapFormStateResult {
  const requestedIndex = options.defaultQuickAmountIndex ?? DEFAULT_QUICK_ZAP_INDEX
  const defaultIndex = Math.min(
    Math.max(0, requestedIndex),
    Math.max(0, QUICK_ZAP_AMOUNTS.length - 1)
  )
  const defaultAmount = QUICK_ZAP_AMOUNTS[defaultIndex] ?? QUICK_ZAP_AMOUNTS[0]

  const [selectedZapAmount, setSelectedZapAmount] = useState<number>(defaultAmount)
  const [customZapAmount, setCustomZapAmount] = useState("")
  const [zapNote, setZapNote] = useState("")

  const trimmedCustomInput = useMemo(() => customZapAmount.replace(/^0+(?=\d)/, ""), [customZapAmount])
  const hasCustomAmount = trimmedCustomInput.length > 0
  const parsedCustomAmount = hasCustomAmount ? Number(trimmedCustomInput) : NaN
  const customAmountInvalid = hasCustomAmount && (!Number.isFinite(parsedCustomAmount) || parsedCustomAmount < MIN_CUSTOM_ZAP)
  const resolvedZapAmount = hasCustomAmount && !customAmountInvalid ? Math.floor(parsedCustomAmount) : selectedZapAmount

  const handleSelectQuickAmount = useCallback((amount: number) => {
    setSelectedZapAmount(amount)
    setCustomZapAmount("")
  }, [])

  const handleCustomAmountChange = useCallback((value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "")
    setCustomZapAmount(digitsOnly)
  }, [])

  const resetForm = useCallback(() => {
    setSelectedZapAmount(defaultAmount)
    setCustomZapAmount("")
    setZapNote("")
  }, [defaultAmount])

  return {
    selectedZapAmount,
    customZapAmount,
    zapNote,
    hasCustomAmount,
    customAmountInvalid,
    resolvedZapAmount,
    handleSelectQuickAmount,
    handleCustomAmountChange,
    setZapNote,
    resetForm
  }
}
