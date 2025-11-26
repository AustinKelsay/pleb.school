/**
 * Authentication Layout Component
 * 
 * This component provides a consistent, theme-aware layout for all authentication pages.
 * It automatically inherits from the configured theme system with support for all 47+ themes.
 */

import { ReactNode } from 'react'
import { copyConfig } from '@/lib/copy'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  description?: string
}

export function AuthLayout({ children, title, description }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Header with Theme-Aware Brand */}
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <svg
                className="h-8 w-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
          </div>
          
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">
              {copyConfig.site.brandName ?? 'pleb.school'}
            </h1>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {children}
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Powered by{' '}
            <span className="text-primary font-medium">Lightning</span> &{' '}
            <span className="text-primary font-medium">Nostr</span>
          </p>
        </div>
      </div>
    </div>
  )
} 
