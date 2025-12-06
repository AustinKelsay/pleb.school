'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { copyConfig } from '@/lib/copy'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const verifyCopy = copyConfig.verifyEmail
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = searchParams.get('ref')

  useEffect(() => {
    if (!ref) setError(verifyCopy?.noRefError ?? 'Invalid verification link.')
  }, [ref, verifyCopy])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ref) return
    if (!code.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, token: code.trim() })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data?.error === 'invalid_token' ? (verifyCopy?.errors?.invalidToken ?? 'Invalid or used verification code.') :
          data?.error === 'token_expired' ? (verifyCopy?.errors?.tokenExpired ?? 'Verification code expired. Request a new one.') :
          data?.error === 'token_mismatch' ? (verifyCopy?.errors?.tokenMismatch ?? 'Code does not match. Try again.') :
          (verifyCopy?.errors?.generic ?? 'Verification failed. Please try again.')
        )
        return
      }
      router.push('/profile?tab=accounts&success=email_linked')
    } catch {
      setError(verifyCopy?.errors?.network ?? 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>{verifyCopy?.title ?? 'Verify Your Email'}</CardTitle>
        </CardHeader>
        <CardContent>
          {!ref ? (
            <p className="text-sm text-red-600">{verifyCopy?.noRefError ?? 'Invalid verification link.'}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm font-medium mb-2">
                  {verifyCopy?.codeLabel ?? 'Verification Code'}
                </label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={verifyCopy?.codePlaceholder ?? 'Enter the 6-digit code'}
                  maxLength={32}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={submitting || !code.trim()} className="w-full">
                {submitting ? (verifyCopy?.buttons?.submitting ?? 'Verifying...') : (verifyCopy?.buttons?.submit ?? 'Verify Email')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
