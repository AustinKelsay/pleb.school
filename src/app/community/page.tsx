import { notFound, redirect } from "next/navigation"
import { isFeedsEnabled } from "@/lib/feeds-config"

export default function CommunityPage() {
  if (!isFeedsEnabled()) {
    notFound()
  }

  redirect("/feeds")
}
