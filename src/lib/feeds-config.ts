import { z } from "zod"
import copyConfig from "../../config/copy.json"

const FeedsRootSchema = z.object({
  feeds: z.object({
    enabled: z.boolean().default(true),
  }).passthrough().default({
    enabled: true,
  }),
})

export interface FeedsConfig {
  enabled: boolean
}

export function parseFeedsConfig(raw: unknown): FeedsConfig {
  const parsed = FeedsRootSchema.parse(raw)
  return {
    enabled: parsed.feeds.enabled,
  }
}

const feedsConfig = parseFeedsConfig(copyConfig)

export function getFeedsConfig(): FeedsConfig {
  return feedsConfig
}

export function isFeedsEnabled(): boolean {
  return feedsConfig.enabled
}
