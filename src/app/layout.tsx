import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import "./globals.css";
import { ConfiguredThemeProvider } from "@/components/configured-theme-provider";
import { RouteScopedSnstrProvider } from "@/components/providers/route-scoped-snstr-provider";
import { ThemeColorProvider } from "@/contexts/theme-context";
import { QueryProvider } from "@/contexts/query-provider";
import { SessionProvider } from "@/contexts/session-provider";
import { ToastProvider } from "@/hooks/use-toast";
import { isAnalyticsEnabled } from "@/lib/analytics";
import { copyConfig } from "@/lib/copy";
import { availableFonts, completeThemes, defaultThemeName } from "@/lib/theme-config";
import {
  getDefaultDarkMode,
  getDefaultFont,
  getDefaultTheme as getConfiguredTheme,
} from "@/lib/theme-ui-config";

const siteFavicon = copyConfig.site.favicon?.trim() || "/favicon.ico";

const configuredThemeName = getConfiguredTheme() || defaultThemeName;
const configuredTheme =
  completeThemes.find((theme) => theme.value === configuredThemeName) ??
  completeThemes.find((theme) => theme.value === defaultThemeName) ??
  completeThemes[0];

const configuredFont = getDefaultFont();
const configuredFontDetails = configuredFont
  ? availableFonts.find((font) => font.value === configuredFont)
  : null;

const initialFontFamily = configuredFontDetails?.fontFamily || configuredTheme.fontFamily;
const initialFontWeight = configuredFontDetails?.fontWeight || configuredTheme.fontWeight;
const configuredDarkMode = getDefaultDarkMode();
const initialRootColors =
  configuredDarkMode === true ? configuredTheme.darkColors : configuredTheme.lightColors;
const sharedThemeVars: Record<string, string> = {
  "--radius": configuredTheme.borderRadius,
  "--font-family": initialFontFamily,
};

function serializeCssVars(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join("");
}

const initialThemeCss = `
html:root{${serializeCssVars({ ...initialRootColors, ...sharedThemeVars })}}
html.light{${serializeCssVars({ ...configuredTheme.lightColors, ...sharedThemeVars })}}
html.dark{${serializeCssVars({ ...configuredTheme.darkColors, ...sharedThemeVars })}}
html body{font-family:${initialFontFamily};font-weight:${initialFontWeight};}
`;

const analyticsEnabled = isAnalyticsEnabled();

export const metadata: Metadata = {
  title: "pleb.school – Nostr-native course & content platform",
  description:
    "Configurable, open-source education stack for courses, videos, and docs with Nostr identity and Lightning-powered interactions.",
  openGraph: {
    title: "pleb.school",
    description: "Nostr-native education platform for courses, videos, and docs with Lightning-powered interactions.",
    type: "website",
    siteName: "pleb.school",
  },
  twitter: {
    card: "summary",
    title: "pleb.school",
    description: "Nostr-native education platform for courses, videos, and docs with Lightning-powered interactions.",
  },
  icons: {
    icon: siteFavicon,
    shortcut: siteFavicon,
    apple: siteFavicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style id="initial-theme-vars">{initialThemeCss}</style>
      </head>
      <body className="antialiased">
        <ConfiguredThemeProvider>
          <ThemeColorProvider>
            <QueryProvider>
              <SessionProvider>
                <ToastProvider>
                  <RouteScopedSnstrProvider>
                    {analyticsEnabled ? (
                      <Suspense fallback={null}>
                        <VercelAnalytics />
                      </Suspense>
                    ) : null}
                    {children}
                  </RouteScopedSnstrProvider>
                </ToastProvider>
              </SessionProvider>
            </QueryProvider>
          </ThemeColorProvider>
        </ConfiguredThemeProvider>
      </body>
    </html>
  );
}
