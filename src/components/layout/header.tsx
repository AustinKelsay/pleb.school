"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Moon, Type, Check } from "lucide-react"
import { getNavigationIcon } from "@/lib/copy-icons"
import { Container } from "./container"
import { ThemeToggle } from "@/components/theme-toggle"
import { ThemeSelector } from "@/components/theme-selector"
import { FontToggle } from "@/components/font-toggle"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"
import { useCopy } from "@/lib/copy"
import { shouldShowThemeSelector, shouldShowFontToggle, shouldShowThemeToggle } from "@/lib/theme-ui-config"
import { useTheme } from "next-themes"
import { useThemeColor } from "@/contexts/theme-context"
import { availableFonts, ThemeName } from "@/lib/theme-config"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useAdminInfo } from "@/hooks/useAdmin"
import { PROFILE_UPDATED_EVENT, type ProfileUpdatedDetail } from "@/lib/profile-events"
import { isAnonymousAvatar, isAnonymousUsername } from "@/lib/anonymous-identity"

const AVATAR_STORAGE_KEY = "ns.header.avatar"
const DISPLAY_NAME_STORAGE_KEY = "ns.header.display-name"

// Configurable navigation icons from config/copy.json (resolved at module scope)
const MenuIcon = getNavigationIcon('menu')
const SearchIcon = getNavigationIcon('search')
const BrandIcon = getNavigationIcon('brand')
const SettingsIcon = getNavigationIcon('settings')
const ProfileIcon = getNavigationIcon('profile')
const LogoutIcon = getNavigationIcon('logout')
const CreateIcon = getNavigationIcon('create')

/**
 * Header component for the main navigation
 * Features brand logo, search functionality, and authentication
 * Uses Container component for consistent spacing with page content
 */
export function Header() {
  const { site, navigation } = useCopy()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { fontOverride, setFontOverride, themeConfig, currentTheme, setCurrentTheme, availableThemes } = useThemeColor()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const { data: session } = useSession()
  const sessionUser = session?.user
  const { adminInfo } = useAdminInfo()
  const isMountedRef = useRef(true)

  const readFromStorage = (key: string, fallback?: string) => {
    if (typeof window === "undefined") {
      return fallback
    }
    try {
      return window.localStorage.getItem(key) || fallback
    } catch {
      return fallback
    }
  }

  const aggregatedIdentityLoadedRef = useRef(false)
  const lastSessionUserIdRef = useRef<string | null>(null)

  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() =>
    readFromStorage(AVATAR_STORAGE_KEY, session?.user?.image || undefined)
  )
  const [displayName, setDisplayName] = useState<string | undefined>(() =>
    readFromStorage(
      DISPLAY_NAME_STORAGE_KEY,
      session?.user?.name || session?.user?.username || undefined
    )
  )
  const canCreateContent =
    Boolean(adminInfo?.isAdmin) ||
    Boolean(adminInfo?.permissions?.createCourse) ||
    Boolean(adminInfo?.permissions?.createResource)

  const clearIdentityCache = useCallback(() => {
    aggregatedIdentityLoadedRef.current = false
    setAvatarUrl(undefined)
    setDisplayName(undefined)
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(AVATAR_STORAGE_KEY)
        window.localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
      } catch (error) {
        console.warn("Failed to clear identity cache:", error)
      }
    }
  }, [])

  const handleSignOut = useCallback(() => {
    clearIdentityCache()
    void signOut()
  }, [clearIdentityCache])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const isMeaningfulName = (value?: string | null) =>
    Boolean(value && !isAnonymousUsername(value))
  const isMeaningfulAvatarUrl = (value?: string | null) =>
    Boolean(value && !isAnonymousAvatar(value))

  useEffect(() => {
    const currentUserId = sessionUser?.id ?? null
    const previousUserId = lastSessionUserIdRef.current
    const hasNewUser = Boolean(currentUserId && !previousUserId)
    const hasUserChanged = Boolean(currentUserId && previousUserId && currentUserId !== previousUserId)

    if (!sessionUser) {
      if (previousUserId !== null || avatarUrl || displayName) {
        clearIdentityCache()
      }
      lastSessionUserIdRef.current = null
      return
    }

    if (hasUserChanged || hasNewUser) {
      aggregatedIdentityLoadedRef.current = false
    } else if (aggregatedIdentityLoadedRef.current) {
      return
    }

    const persistAvatar = (value?: string) => {
      if (typeof window === "undefined") {
        return
      }
      try {
        if (value) {
          window.localStorage.setItem(AVATAR_STORAGE_KEY, value)
        } else {
          window.localStorage.removeItem(AVATAR_STORAGE_KEY)
        }
      } catch (error) {
        console.warn("Failed to persist avatar to storage:", error)
      }
    }

    const persistDisplayName = (value?: string) => {
      if (typeof window === "undefined") {
        return
      }
      try {
        if (value) {
          window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, value)
        } else {
          window.localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
        }
      } catch (error) {
        console.warn("Failed to persist display name to storage:", error)
      }
    }

    const nextAvatar = sessionUser.image || undefined
    if (nextAvatar) {
      const nextMeaningful = isMeaningfulAvatarUrl(nextAvatar)
      const currentMeaningful = isMeaningfulAvatarUrl(avatarUrl)
      if (hasUserChanged || hasNewUser || nextMeaningful || !currentMeaningful) {
        setAvatarUrl(nextAvatar)
        persistAvatar(nextAvatar)
      }
    } else if (hasUserChanged || hasNewUser) {
      setAvatarUrl(undefined)
      persistAvatar(undefined)
    }

    const nextDisplayName = sessionUser.name || sessionUser.username || undefined
    if (nextDisplayName) {
      const nextMeaningful = isMeaningfulName(nextDisplayName)
      const currentMeaningful = isMeaningfulName(displayName)
      if (hasUserChanged || hasNewUser || nextMeaningful || !currentMeaningful) {
        setDisplayName(nextDisplayName)
        persistDisplayName(nextDisplayName)
      }
    } else if (hasUserChanged || hasNewUser) {
      setDisplayName(undefined)
      persistDisplayName(undefined)
    }

    lastSessionUserIdRef.current = currentUserId
  }, [
    clearIdentityCache,
    avatarUrl,
    displayName,
    sessionUser,
  ])

  const loadAggregatedProfile = useCallback(async () => {
    if (!sessionUser?.id) {
      return
    }
    try {
      const response = await fetch("/api/profile/aggregated", { cache: "no-store" })
      if (!response.ok) return
      const data = await response.json()
      if (!isMountedRef.current) return

      if (data?.image?.value) {
        setAvatarUrl(data.image.value as string)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AVATAR_STORAGE_KEY, data.image.value as string)
        }
      } else {
        setAvatarUrl(undefined)
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(AVATAR_STORAGE_KEY)
        }
      }

      const aggregatedName = data?.name?.value || data?.username?.value
      if (aggregatedName) {
        setDisplayName(aggregatedName as string)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, aggregatedName as string)
        }
      } else {
        setDisplayName(undefined)
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
        }
      }
      aggregatedIdentityLoadedRef.current = true
    } catch (error) {
      console.error("Failed to refresh aggregated profile for header", error)
    }
  }, [sessionUser?.id])

  useEffect(() => {
    loadAggregatedProfile()
  }, [loadAggregatedProfile])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail
      if (detail && Object.prototype.hasOwnProperty.call(detail, 'image')) {
        if (detail.image) {
          setAvatarUrl(detail.image)
          try {
            window.localStorage.setItem(AVATAR_STORAGE_KEY, detail.image)
          } catch {}
        } else {
          setAvatarUrl(undefined)
          try {
            window.localStorage.removeItem(AVATAR_STORAGE_KEY)
          } catch {}
        }
      }
      if (detail && (Object.prototype.hasOwnProperty.call(detail, 'name') || Object.prototype.hasOwnProperty.call(detail, 'username'))) {
        const nextName = detail?.name || detail?.username || undefined
        if (nextName) {
          setDisplayName(nextName)
          try {
            window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, nextName)
          } catch {}
        } else {
          setDisplayName(undefined)
          try {
            window.localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
          } catch {}
        }
      }
      loadAggregatedProfile()
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handler)
    }
  }, [loadAggregatedProfile])

  function handleThemeSelect(themeName: ThemeName) {
    setCurrentTheme(themeName)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-16 items-center">
        {/* Left Section */}
        <div className="flex flex-1 items-center space-x-1 sm:space-x-2">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <BrandIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden sm:block text-xl font-bold">{site.brandName}</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MenuIcon className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link href="/content">{navigation.menuItems.content}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/feeds">{navigation.menuItems.feeds}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/subscribe">{navigation.menuItems.subscribe}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/about">{navigation.menuItems.about}</Link>
              </DropdownMenuItem>
              
                              {/* Theme and Style Settings - Only show on mobile */}
                {(shouldShowThemeSelector() || shouldShowFontToggle() || shouldShowThemeToggle()) && (
                  <>
                    <DropdownMenuSeparator className="sm:hidden" />
                    
                    {/* Dark/Light Mode Toggle Switch */}
                    {shouldShowThemeToggle() && (
                      <div className="flex items-center justify-between px-2 py-1.5 sm:hidden">
                        <div className="flex items-center">
                          <Moon className="h-4 w-4 mr-2" />
                        </div>
                        <Switch
                          checked={resolvedTheme === "light"}
                          onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
                          aria-label="Toggle dark mode"
                        />
                      </div>
                    )}

                    {/* Theme Selector */}
                    {shouldShowThemeSelector() && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="sm:hidden">
                          <SettingsIcon className="mr-2 h-4 w-4" />
                          Theme
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64 max-h-80 overflow-y-auto">
                          {availableThemes.map((themeOption) => (
                            <DropdownMenuItem
                              key={themeOption.value}
                              onClick={() => handleThemeSelect(themeOption.value)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{themeOption.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {themeOption.description}
                                </span>
                                <span className="text-xs text-muted-foreground/70 mt-1">
                                  {themeOption.fontFamily.split(',')[0]} • {themeOption.borderRadius} • {themeOption.style}
                                </span>
                              </div>
                              {currentTheme === themeOption.value && (
                                <Check className="h-4 w-4" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* Font Selection */}
                    {shouldShowFontToggle() && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="sm:hidden">
                          <Type className="mr-2 h-4 w-4" />
                          Font
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem
                            onClick={() => setFontOverride(null)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center">
                              <Type className="mr-2 h-4 w-4" />
                              Theme Default
                            </div>
                            {fontOverride === null && <Check className="h-4 w-4" />}
                          </DropdownMenuItem>
                          {availableFonts.map((font) => (
                            <DropdownMenuItem
                              key={font.value}
                              onClick={() => setFontOverride(font.value)}
                              className="flex items-center justify-between"
                              style={{ fontFamily: font.fontFamily }}
                            >
                              <div className="flex items-center">
                                <Type className="mr-2 h-4 w-4" />
                                {font.name}
                              </div>
                              {fontOverride === font.value && <Check className="h-4 w-4" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  </>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Centered Search Bar */}
        <div className="flex flex-none justify-center px-4 lg:px-6">
          <form onSubmit={handleSearch} className="relative hidden w-full max-w-md sm:block">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={navigation.searchPlaceholder}
              className="w-full pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        {/* Right-aligned Actions */}
        <div className="flex flex-1 items-center justify-end space-x-1 sm:space-x-2 md:space-x-4">
          {/* Search icon - only show on mobile */}
          <Link href="/search" className="sm:hidden">
            <Button variant="ghost" size="icon">
              <SearchIcon className="h-4 w-4" />
            </Button>
          </Link>
          
          {/* Theme controls - only show on desktop */}
          {shouldShowThemeSelector() && <div className="hidden sm:block"><ThemeSelector /></div>}
          {shouldShowFontToggle() && <div className="hidden md:block"><FontToggle /></div>}
          {shouldShowThemeToggle() && <div className="hidden sm:block"><ThemeToggle /></div>}
          
          {/* Authentication Section */}
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatarUrl} alt={displayName || session.user.name || "User"} />
                    <AvatarFallback>
                      {(displayName || session.user.name || session.user.username || "U")
                        .substring(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {displayName || session.user.name || session.user.username || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center">
                    <ProfileIcon className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile?tab=settings" className="flex items-center">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                {canCreateContent && (
                  <DropdownMenuItem asChild>
                    <Link href="/create" className="flex items-center">
                      <CreateIcon className="mr-2 h-4 w-4" />
                      <span>Create</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center"
                >
                  <LogoutIcon className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/auth/signin">
              <Button size="sm" className="text-xs sm:text-sm">{navigation.buttons.login}</Button>
            </Link>
          )}
        </div>
      </Container>
    </header>
  )
}
