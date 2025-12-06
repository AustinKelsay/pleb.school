import { z } from "zod"
import paymentsConfigRaw from "../../config/payments.json"

const ProgressBasisSchema = z.enum(["server", "serverPlusViewer"])

const PaymentsConfigSchema = z.object({
  zap: z.object({
    quickAmounts: z.array(z.number().positive()),
    defaultQuickIndex: z.number().int().min(0),
    minCustomZap: z.number().positive(),
    noteMaxBytes: z.number().int().positive(),
    autoShowQr: z.boolean(),
    privacyToggle: z.object({
      enabled: z.boolean(),
      requireAuth: z.boolean(),
      hideWhenPrivkeyPresent: z.boolean()
    }),
    recentZapsLimit: z.number().int().positive()
  }),
  purchase: z.object({
    minZap: z.number().positive(),
    autoCloseMs: z.number().int().positive(),
    autoShowQr: z.boolean(),
    progressBasis: ProgressBasisSchema,
    noteMaxBytes: z.number().int().positive()
  })
})

export type ProgressBasis = z.infer<typeof ProgressBasisSchema>
export type PaymentsConfig = z.infer<typeof PaymentsConfigSchema>

const paymentsConfig = PaymentsConfigSchema.parse(paymentsConfigRaw)

export function getPaymentsConfig(): PaymentsConfig {
  return paymentsConfig
}

export { paymentsConfig }
export default paymentsConfig
