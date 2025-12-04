export interface AdditionalLink {
  url: string
  /**
   * Optional human-friendly label to render as the anchor text.
   * Legacy links may omit this and fall back to a derived label.
   */
  title?: string | null
}
