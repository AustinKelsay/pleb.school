"use client"

import * as React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { getDefaultDarkMode, shouldShowThemeToggle } from "@/lib/theme-ui-config"

interface ConfiguredThemeProviderProps {
  children: React.ReactNode
}

/**
 * Theme provider wrapper that uses configuration defaults
 * Applies dark mode defaults from theme.json config
 */
export function ConfiguredThemeProvider({ children }: ConfiguredThemeProviderProps) {
  const configDarkMode = getDefaultDarkMode()
  
  const showThemeToggle = shouldShowThemeToggle()

  // Determine the default theme based on configuration
  let defaultTheme: "light" | "dark" | "system" = "system"
  if (configDarkMode === true) {
    defaultTheme = "dark"
  } else if (configDarkMode === false) {
    defaultTheme = "light"
  } else if (!showThemeToggle) {
    // next-themes ignores "system" when enableSystem=false, so choose concrete fallback
    defaultTheme = "light"
  }

  const forcedTheme = !showThemeToggle && configDarkMode !== null
    ? (configDarkMode ? "dark" : "light")
    : undefined

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      forcedTheme={forcedTheme}
      enableSystem={showThemeToggle && configDarkMode === null}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}