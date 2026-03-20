import React from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MainLayout } from "@/components/layout"
import { copyConfig } from "@/lib/copy"
import { isFeedsEnabled } from "@/lib/feeds-config"
import { FeedsClient } from "./feeds-client"

const feedsCopy = copyConfig.feeds

export const metadata: Metadata = {
  title: feedsCopy?.meta?.title ?? "Feeds",
  description: feedsCopy?.meta?.description ?? "Community chat and activity feeds.",
}

export default function FeedsPage() {
  if (!isFeedsEnabled()) {
    notFound()
  }

  return (
    <MainLayout>
      <FeedsClient />
    </MainLayout>
  )
}
