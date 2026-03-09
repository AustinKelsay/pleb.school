import {
  LocalKeySigner,
  Nip07Signer,
  getSignerCapabilities,
  type Signer,
} from "snstr"
import { CommunityError, type CommunitySignerResolution } from "./types"

export interface ResolveCommunitySignerOptions {
  privateKey?: string | null
  allowNip07?: boolean
  signer?: Signer
}

export function canUseNip07Signer(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  return Boolean(
    window.nostr &&
    typeof window.nostr.getPublicKey === "function" &&
    typeof window.nostr.signEvent === "function"
  )
}

async function finalizeSigner(
  signer: Signer,
  mode: CommunitySignerResolution["mode"]
): Promise<CommunitySignerResolution> {
  const pubkey = await signer.getPublicKey()
  const capabilities = getSignerCapabilities(signer)

  return {
    mode,
    signer,
    capabilities,
    pubkey,
  }
}

export async function resolveCommunitySigner(
  options: ResolveCommunitySignerOptions
): Promise<CommunitySignerResolution> {
  if (options.signer) {
    return finalizeSigner(options.signer, "custom")
  }

  const privateKey = options.privateKey?.trim()
  if (privateKey) {
    return finalizeSigner(new LocalKeySigner(privateKey), "local")
  }

  if (options.allowNip07) {
    if (!canUseNip07Signer()) {
      throw new CommunityError(
        "auth_unavailable",
        "NIP-07 signing is not available in the current environment.",
        {
          operation: "resolve_signer",
        }
      )
    }

    return finalizeSigner(new Nip07Signer(), "nip07")
  }

  throw new CommunityError(
    "auth_unavailable",
    "No community signer is available. Provide a private key or enable NIP-07.",
    {
      operation: "resolve_signer",
    }
  )
}
