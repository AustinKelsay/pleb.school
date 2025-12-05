import paymentsConfigRaw from "../../config/payments.json"

type ProgressBasis = "server" | "serverPlusViewer"

export interface PaymentsConfig {
  zap: {
    quickAmounts: number[]
    defaultQuickIndex: number
    minCustomZap: number
    noteMaxBytes: number
    autoShowQr: boolean
    privacyToggle: {
      enabled: boolean
      requireAuth: boolean
      hideWhenPrivkeyPresent: boolean
    }
    recentZapsLimit: number
  }
  purchase: {
    minZap: number
    autoCloseMs: number
    autoShowQr: boolean
    progressBasis: ProgressBasis
    noteMaxBytes: number
  }
}

const paymentsConfig = paymentsConfigRaw as PaymentsConfig

export function getPaymentsConfig(): PaymentsConfig {
  return paymentsConfig
}

export { paymentsConfig }
export default paymentsConfig
