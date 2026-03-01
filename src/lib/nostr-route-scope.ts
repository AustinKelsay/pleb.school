const SNSTR_DISABLED_PREFIXES = ["/auth/"]
const SNSTR_DISABLED_EXACT_PATHS = new Set([
  "/auth",
  "/about",
  "/feeds",
  "/subscribe",
  "/verify-email",
])

export function shouldEnableSnstrForPathname(pathname: string | null): boolean {
  if (!pathname) return true
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  if (SNSTR_DISABLED_EXACT_PATHS.has(normalizedPath)) return false
  return !SNSTR_DISABLED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
}
