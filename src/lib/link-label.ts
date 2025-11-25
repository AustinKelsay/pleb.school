/**
 * Produce a human-friendly label for an external link:
 * - Shows the domain without protocol/www
 * - Adds the first path segment if present
 * - Truncates gracefully for long URLs
 */
export function formatLinkLabel(raw: string): string {
  const trimmed = (raw || "").trim()
  if (!trimmed) return "Link"

  const truncate = (value: string) => (value.length > 42 ? `${value.slice(0, 39)}...` : value)

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const url = new URL(normalized)
    const host = url.hostname.replace(/^www\./i, "")
    const pathParts = url.pathname.split("/").filter(Boolean)
    const pathLabel = pathParts.length > 0 ? ` /${pathParts[0]}${pathParts.length > 1 ? "/..." : ""}` : ""
    return truncate(`${host}${pathLabel}`)
  } catch {
    return truncate(trimmed)
  }
}
