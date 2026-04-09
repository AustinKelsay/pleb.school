import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { createElement } from "react"
import { authOptions } from "@/lib/auth"
import { validateCallbackUrl } from "@/lib/url-utils"
import SignInPageClient from "./signin-page-client"

type SignInPageSearchParams = {
  callbackUrl?: string | string[]
}

function getRedirectTarget(rawCallbackUrl: string | undefined): string {
  const callbackUrl = validateCallbackUrl(rawCallbackUrl).sanitizedUrl
  return callbackUrl.startsWith("/auth") ? "/" : callbackUrl
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInPageSearchParams>
}) {
  const session = await getServerSession(authOptions)

  if (session?.user?.id) {
    const params = await searchParams
    const callbackUrl = Array.isArray(params.callbackUrl) ? params.callbackUrl[0] : params.callbackUrl
    redirect(getRedirectTarget(callbackUrl))
  }

  return createElement(SignInPageClient)
}
