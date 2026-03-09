import { LocalKeySigner } from "snstr"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { decryptPrivkey } from "@/lib/privkey-crypto"
import { prisma } from "@/lib/prisma"
import { CommunityRelayService } from "./relay-service"
import { CommunityError, type CommunityViewerContext } from "./types"

export async function getCommunityViewerContext(): Promise<CommunityViewerContext> {
  const session = await getServerSession(authOptions)

  return {
    userId: session?.user?.id,
    pubkey: session?.user?.pubkey,
    provider: session?.provider,
    isAuthenticated: Boolean(session?.user?.id),
    canServerSign: Boolean(session?.user?.hasEphemeralKeys),
  }
}

export async function createServerCommunityRelayServiceForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      pubkey: true,
      privkey: true,
    },
  })

  if (!user) {
    throw new CommunityError(
      "auth_failed",
      "User not found for community relay action.",
      {
        operation: "resolve_signer",
        details: { userId },
      }
    )
  }

  if (!user.privkey) {
    throw new CommunityError(
      "auth_unavailable",
      "Server-managed community signing is unavailable for this account.",
      {
        operation: "resolve_signer",
        pubkey: user.pubkey ?? undefined,
        details: { userId },
      }
    )
  }

  const privateKey = decryptPrivkey(user.privkey)
  if (!privateKey) {
    throw new CommunityError(
      "auth_unavailable",
      "Server-managed community signing is unavailable for this account.",
      {
        operation: "resolve_signer",
        pubkey: user.pubkey ?? undefined,
        details: { userId },
      }
    )
  }

  return {
    service: new CommunityRelayService({
      signer: new LocalKeySigner(privateKey),
    }),
    pubkey: user.pubkey ?? undefined,
  }
}
