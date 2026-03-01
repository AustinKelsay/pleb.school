const SNSTR_DISABLED_PREFIXES = ["/auth"]
const SNSTR_DISABLED_EXACT_PATHS = new Set([
  "/about",
  "/feeds",
  "/subscribe",
  "/verify-email",
])

export function shouldEnableSnstrForPathname(pathname: string | null): boolean {
  if (!pathname) return true
  if (SNSTR_DISABLED_EXACT_PATHS.has(pathname)) return false
  return !SNSTR_DISABLED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
