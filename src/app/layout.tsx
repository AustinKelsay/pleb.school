import type { Metadata } from "next";
import "./globals.css";
import { ConfiguredThemeProvider } from "@/components/configured-theme-provider";
import { ThemeColorProvider } from "@/contexts/theme-context";
import { SnstrProvider } from "@/contexts/snstr-context";
import { QueryProvider } from "@/contexts/query-provider";
import { SessionProvider } from "@/contexts/session-provider";
import { ToastProvider } from "@/hooks/use-toast";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ConfiguredThemeProvider>
          <ThemeColorProvider>
            <QueryProvider>
              <SessionProvider>
                <ToastProvider>
                  <SnstrProvider>
                    {children}
                  </SnstrProvider>
                </ToastProvider>
              </SessionProvider>
            </QueryProvider>
          </ThemeColorProvider>
        </ConfiguredThemeProvider>
      </body>
    </html>
  );
}
