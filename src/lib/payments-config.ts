import { z } from "zod"
import paymentsConfigRaw from "../../config/payments.json"
import { getIcon, type LucideIcon } from "@/lib/icons-config"

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

// ============================================================================
// Icon Configuration
// ============================================================================

interface PaymentsIconsConfig {
  interactions: Record<string, string>
  status: Record<string, string>
  purchase: Record<string, string>
}

/**
 * Get icons configuration from payments.json
 * Note: Icons are not Zod-validated since they're optional UI customization
 */
export function getPaymentsIconsConfig(): PaymentsIconsConfig {
  return (paymentsConfigRaw as { icons: PaymentsIconsConfig }).icons
}

/**
 * Get an interaction icon
 * @param key - Interaction icon key (zap, heart, comment)
 */
export function getInteractionIcon(key: string): LucideIcon {
  const icons = getPaymentsIconsConfig()
  const iconName = icons.interactions[key] || "Zap"
  return getIcon(iconName, "Zap")
}

/**
 * Get all interaction icons as a record
 */
export function getAllInteractionIcons(): Record<string, LucideIcon> {
  const icons = getPaymentsIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.interactions)) {
    result[key] = getIcon(iconName, "Zap")
  }
  return result
}

/**
 * Get a payment status icon
 * @param key - Status icon key (success, pending, error)
 */
export function getPaymentStatusIcon(key: string): LucideIcon {
  const icons = getPaymentsIconsConfig()
  const iconName = icons.status[key] || "Info"
  return getIcon(iconName, "Info")
}

/**
 * Get all payment status icons as a record
 */
export function getAllPaymentStatusIcons(): Record<string, LucideIcon> {
  const icons = getPaymentsIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.status)) {
    result[key] = getIcon(iconName, "Info")
  }
  return result
}

/**
 * Get a purchase-related icon
 * @param key - Purchase icon key (shieldCheck, wallet)
 */
export function getPurchaseIcon(key: string): LucideIcon {
  const icons = getPaymentsIconsConfig()
  const iconName = icons.purchase[key] || "ShieldCheck"
  return getIcon(iconName, "ShieldCheck")
}

/**
 * Get all purchase icons as a record
 */
export function getAllPurchaseIcons(): Record<string, LucideIcon> {
  const icons = getPaymentsIconsConfig()
  const result: Record<string, LucideIcon> = {}
  for (const [key, iconName] of Object.entries(icons.purchase)) {
    result[key] = getIcon(iconName, "ShieldCheck")
  }
  return result
}
