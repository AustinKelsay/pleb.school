export type PurchaseStatus = "unlocked" | "partial" | "refunded" | "manual"

export type TraceStep = {
  label: string
  detail?: string
  at?: string | null
  kind?: "info" | "success" | "warning" | "error"
}

export type ReceiptSummary = {
  id: string
  amountSats: number | null
  bolt11?: string | null
  payerPubkey?: string | null
  createdAt?: number | null
  description?: string | null
  raw?: any
}

export type PurchaseListItem = {
  id: string
  userId: string
  courseId?: string | null
  resourceId?: string | null
  amountPaid: number
  paymentType: string
  zapReceiptId?: string | null
  invoice?: string | null
  zapReceiptJson?: any
  zapRequestJson?: any
  createdAt: string
  updatedAt: string
  contentType: "course" | "resource"
  priceSats: number
  receiptCount: number
  receiptsTotalSats: number
  receipts?: ReceiptSummary[]
  status: PurchaseStatus
  lifeCycle: TraceStep[]
  href?: string
  // Content metadata for display
  contentId?: string | null
  noteId?: string | null
  videoId?: string | null
  videoUrl?: string | null
  thumbnail?: string | null
  lessonCount?: number | null
  creatorId?: string | null
  // Enriched data from Nostr notes (added client-side)
  title?: string
  description?: string
  image?: string
  topics?: string[]
  user?: {
    id: string
    username?: string | null
    email?: string | null
    avatar?: string | null
    pubkey?: string | null
  }
}

export type PurchaseStats = {
  totalPurchases: number
  totalRevenueSats: number
  unlockedCount: number
  partialCount: number
  refundCount: number
  buyers: number
  averageTicketSats: number
}
