"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCopy } from "@/lib/copy"
import { getErrorIcon } from "@/lib/copy-icons"

// Configurable icons from config/copy.json (resolved at module scope)
const ErrorIcon = getErrorIcon('serverError')
const RefreshIcon = getErrorIcon('refresh')

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Error boundary component for handling runtime errors
 * Provides user-friendly error messages and retry functionality
 */
export default function Error({ error, reset }: ErrorProps) {
  const { errors } = useCopy()

  useEffect(() => {
    // Log error to your error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ErrorIcon className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-destructive">{errors.general.title}</CardTitle>
          <CardDescription>{errors.general.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            onClick={reset}
            variant="outline"
            className="w-full"
          >
            <RefreshIcon className="mr-2 h-4 w-4" />
            {errors.general.button}
          </Button>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {errors.development.details}
              </summary>
              <pre className="mt-2 rounded bg-muted p-2 text-xs">
                {error.message}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 
