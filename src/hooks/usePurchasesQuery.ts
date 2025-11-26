"use client"

import { useQuery } from "@tanstack/react-query"

import type { PurchaseListItem, PurchaseStats } from "@/types/purchases"

export type PurchasesScope = "mine" | "all"

export interface FetchPurchasesParams {
  scope?: PurchasesScope
  limit?: number
}

export interface PurchasesPayload {
  purchases: PurchaseListItem[]
  stats: PurchaseStats | null
}

export async function fetchPurchases(params: FetchPurchasesParams = {}): Promise<PurchasesPayload> {
  const search = new URLSearchParams()
  const scope = params.scope ?? "mine"
  if (scope === "all") search.set("scope", "all")
  if (typeof params.limit === "number") search.set("limit", params.limit.toString())

  const url = `/api/purchases${search.toString() ? `?${search.toString()}` : ""}`
  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = typeof body?.error === "string" ? body.error : "Failed to fetch purchases"
    throw new Error(message)
  }

  const json = await res.json()
  const purchases: PurchaseListItem[] = json?.data?.purchases ?? []
  const stats: PurchaseStats | null = json?.data?.stats ?? null

  return { purchases, stats }
}

export interface UsePurchasesOptions extends FetchPurchasesParams {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
}

export function usePurchasesQuery(options: UsePurchasesOptions = {}) {
  const {
    scope = "mine",
    limit,
    enabled = true,
    staleTime = 60 * 1000,
    gcTime = 15 * 60 * 1000
  } = options

  const query = useQuery({
    queryKey: ["purchases", scope, limit ?? "default"],
    queryFn: () => fetchPurchases({ scope, limit }),
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false
  })

  return {
    data: query.data,
    purchases: query.data?.purchases ?? [],
    stats: query.data?.stats ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch
  }
}
