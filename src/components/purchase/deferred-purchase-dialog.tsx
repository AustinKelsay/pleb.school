"use client"

import dynamic from "next/dynamic"

import type { PurchaseDialogProps } from "@/components/purchase/purchase-dialog"

const LazyPurchaseDialog = dynamic(
  () => import("@/components/purchase/purchase-dialog").then((mod) => mod.PurchaseDialog),
  { ssr: false }
)

export const DeferredPurchaseDialog = (props: PurchaseDialogProps) => {
  if (!props.isOpen) {
    return null
  }

  return <LazyPurchaseDialog {...props} />
}
