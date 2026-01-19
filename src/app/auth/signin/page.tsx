/**
 * Clean OAuth-style Authentication Sign-In Page
 * 
 * Modern authentication interface with multiple providers
 * Follows current design patterns with proper spacing and visual hierarchy
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { hasNip07Support } from 'snstr'
import { authConfigClient } from '@/lib/auth-config-client'
import { validateCallbackUrlFromParams } from '@/lib/url-utils'
import { Mail, Github, Zap, KeyRound, UserX, Sparkles, ArrowRight, HelpCircle, Shield, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import {
  clearPersistedAnonymousIdentity,
  getPersistedAnonymousIdentity,
  persistAnonymousIdentity,
  hasLegacyPersistedIdentity,
  getLegacyIdentityForMigration,
  hasAnyPersistedAnonymousIdentity,
} from '@/lib/anonymous-client-storage'
import { cn } from '@/lib/utils'
import { NostrichIcon } from '@/components/icons/nostrich-icon'

interface NostrWindow extends Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: {
      kind: number
      created_at: number
      tags: string[][]
      content: string
    }): Promise<{
      id: string
      pubkey: string
      created_at: number
      kind: number
      tags: string[][]
      content: string
      sig: string
    }>
  }
}

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isNostrLoading, setIsNostrLoading] = useState(false)
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  const [isAnonymousLoading, setIsAnonymousLoading] = useState(false)
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [hasPersistedAnonymousIdentity, setHasPersistedAnonymousIdentity] = useState(false)
  const [anonymousResumeFailed, setAnonymousResumeFailed] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)

  const callbackUrl = validateCallbackUrlFromParams(searchParams, 'callbackUrl', '/')
  const errorType = searchParams.get('error')
  const copy = authConfigClient.copy.signin
  const hasCachedAnonymousIdentity = hasPersistedAnonymousIdentity && !anonymousResumeFailed

  const anonymousButtonLabel = isAnonymousLoading
    ? copy.anonymousCard.loadingButton
    : hasCachedAnonymousIdentity
      ? copy.anonymousCard.resumeButton || 'Resume anonymous session'
      : copy.anonymousCard.button

  const anonymousDescription = hasCachedAnonymousIdentity
    ? copy.anonymousCard.resumeDescription || 'Pick up the anonymous account stored in this browser.'
    : copy.anonymousCard.description

  useEffect(() => {
    // Check for either new token format or legacy privkey format
    setHasPersistedAnonymousIdentity(hasAnyPersistedAnonymousIdentity())
  }, [])

  // Cache the anonymous identity after a successful anon login
  // Token is stored in httpOnly cookie (secure) AND localStorage (for backward compatibility)
  // localStorage storage can be removed once all clients migrate to cookie-based reconnect flow
  const persistAnonymousSessionIdentity = useCallback(async () => {
    try {
      const session = await getSession()
      if (session?.provider !== 'anonymous' || !session.user?.reconnectToken) {
        return
      }

      // Store the reconnect token in an httpOnly cookie via API (XSS-safe)
      const response = await fetch('/api/auth/anon-reconnect', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        console.warn('Failed to set reconnect cookie via API')
      }

      // Also store in localStorage for backward compatibility during transition
      // This can be removed once all clients have migrated to cookie-based flow
      persistAnonymousIdentity({
        reconnectToken: session.user.reconnectToken,
        pubkey: session.user.pubkey,
        userId: session.user.id,
      })
      setHasPersistedAnonymousIdentity(true)
    } catch (storageError) {
      console.warn('Failed to persist anonymous identity:', storageError)
    }
  }, [])

  const handleResetAnonymousIdentity = useCallback(async () => {
    // Clear httpOnly cookie via API
    try {
      await fetch('/api/auth/anon-reconnect', {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch {
      // Continue even if API call fails - localStorage clear is sufficient
    }
    // Clear localStorage (backward compatibility)
    clearPersistedAnonymousIdentity()
    setHasPersistedAnonymousIdentity(false)
    setAnonymousResumeFailed(false)
  }, [])

  // Handle email magic link sign in
  const handleEmailSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsLoading(true)
    setError('')
    setMessage('')

    try {
      const result = await signIn('email', {
        email,
        callbackUrl,
        redirect: false,
      })

      if (result?.error) {
        setError(copy.messages.emailError)
      } else {
        setMessage(copy.messages.emailSent.replace('{email}', email))
      }
    } catch (err) {
      setError(copy.messages.genericError)
    } finally {
      setIsLoading(false)
    }
  }, [email, callbackUrl, copy.messages.emailError, copy.messages.emailSent, copy.messages.genericError])

  // Handle NIP07 Nostr sign in with NIP-98 authentication
  // See: https://nips.nostr.com/98
  const handleNostrSignIn = useCallback(async () => {
    setIsNostrLoading(true)
    setError('')

    try {
      if (!hasNip07Support()) {
        setError(copy.messages.nostrExtensionMissing)
        return
      }

      const nostr = (window as NostrWindow).nostr!

      // 1. Get user's public key from the extension
      const pubkey = await nostr.getPublicKey()

      // 2. Create NIP-98 authentication event (kind 27235)
      // This proves ownership of the pubkey via cryptographic signature
      const authEventTemplate = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['u', `${window.location.origin}/api/auth/callback/nostr`],
          ['method', 'POST']
        ],
        content: ''
      }

      // 3. Sign the event with NIP-07 extension
      const signedAuthEvent = await nostr.signEvent(authEventTemplate)

      // 4. Authenticate with NextAuth using pubkey + signed NIP-98 event
      const result = await signIn('nostr', {
        pubkey,
        authEvent: JSON.stringify(signedAuthEvent),
        callbackUrl,
        redirect: false,
      })

      if (result?.error) {
        setError(copy.messages.nostrError)
      } else {
        // Success - redirect will be handled by NextAuth
        router.push(callbackUrl)
      }
    } catch (err) {
      console.error('Nostr sign in error:', err)
      setError(err instanceof Error ? err.message : copy.messages.nostrError)
    } finally {
      setIsNostrLoading(false)
    }
  }, [callbackUrl, router, copy.messages.nostrError, copy.messages.nostrExtensionMissing])

  // Handle GitHub sign in
  const handleGithubSignIn = useCallback(async () => {
    setIsGithubLoading(true)
    setError('')

    try {
      await signIn('github', {
        callbackUrl,
      })
    } catch (err) {
      console.error('GitHub sign in error:', err)
      setError(copy.messages.githubError || copy.messages.genericError)
    } finally {
      setIsGithubLoading(false)
    }
  }, [callbackUrl, copy.messages.githubError, copy.messages.genericError])

  // Handle Anonymous sign in with secure token-based reconnection
  const handleAnonymousSignIn = useCallback(async () => {
    setIsAnonymousLoading(true)
    setError('')
    setAnonymousResumeFailed(false)

    try {
      const retryableAnonErrors = new Set(['CredentialsSignin', 'ANON_INVALID_KEY'])

      // Check for new token format first, then legacy privkey for migration
      const tokenIdentity = getPersistedAnonymousIdentity()
      const legacyIdentity = getLegacyIdentityForMigration()
      const attemptExistingIdentity = Boolean(tokenIdentity?.reconnectToken || legacyIdentity?.privkey)
      setHasPersistedAnonymousIdentity(attemptExistingIdentity)

      // Helper for anonymous sign in with either token or legacy privkey
      const attemptAnonymousSignIn = (reconnectToken?: string, privateKey?: string) =>
        signIn('anonymous', {
          callbackUrl,
          redirect: false,
          ...(reconnectToken ? { reconnectToken } : {}),
          ...(privateKey ? { privateKey } : {}),
        })

      let result

      // First try token-based reconnection (new secure path)
      if (tokenIdentity?.reconnectToken) {
        result = await attemptAnonymousSignIn(tokenIdentity.reconnectToken)
      }
      // Fall back to legacy privkey migration
      else if (legacyIdentity?.privkey) {
        result = await attemptAnonymousSignIn(undefined, legacyIdentity.privkey)
      }
      // No existing identity, create new account
      else {
        result = await attemptAnonymousSignIn()
      }

      if (result?.error && attemptExistingIdentity) {
        if (!retryableAnonErrors.has(result.error)) {
          setAnonymousResumeFailed(true)
          setMessage('')
          setError(copy.messages.anonymousError || copy.messages.genericError)
          return
        }
        setAnonymousResumeFailed(true)
        setMessage('Refreshing your anonymous identity…')
        setError('')
        // Clear the stale identity (both localStorage and httpOnly cookie)
        clearPersistedAnonymousIdentity()
        try {
          await fetch('/api/auth/anon-reconnect', { method: 'DELETE', credentials: 'include' })
        } catch { /* ignore */ }
        setHasPersistedAnonymousIdentity(false)
        result = await attemptAnonymousSignIn()
      }

      if (result?.error) {
        setError(copy.messages.anonymousError || copy.messages.genericError)
        setMessage('')
      } else {
        // Success - persist the new reconnect token
        await persistAnonymousSessionIdentity()
        setAnonymousResumeFailed(false)
        setHasPersistedAnonymousIdentity(true)
        setMessage('')
        router.push(callbackUrl)
      }
    } catch (err) {
      console.error('Anonymous sign in error:', err)
      setError(copy.messages.anonymousError || copy.messages.genericError)
    } finally {
      setIsAnonymousLoading(false)
    }
  }, [callbackUrl, router, copy.messages.anonymousError, copy.messages.genericError, persistAnonymousSessionIdentity])

  // Handle Recovery sign in
  const handleRecoverySignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!privateKey) return

    setIsRecoveryLoading(true)
    setError('')

    try {
      const result = await signIn('recovery', {
        privateKey,
        callbackUrl,
        redirect: false,
      })

      if (result?.error) {
        setError(copy.messages.recoveryError || copy.messages.genericError)
      } else {
        // Success - redirect will be handled by NextAuth
        router.push(callbackUrl)
      }
    } catch (err) {
      console.error('Recovery sign in error:', err)
      setError(copy.messages.recoveryError || copy.messages.genericError)
    } finally {
      setIsRecoveryLoading(false)
    }
  }, [privateKey, callbackUrl, router, copy.messages.recoveryError, copy.messages.genericError])

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/50">
        <Container className="py-8 lg:py-16">
          <Section className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-4 mb-12">
              <Badge variant="outline" className="w-fit mx-auto">
                <Sparkles className="h-3 w-3 mr-1" />
                Lightning & Nostr Enabled
              </Badge>
              
              <h1 className="text-3xl lg:text-4xl font-bold">{copy.title}</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {copy.description}
              </p>
            </div>

          {/* Error Display */}
          {(error || errorType) && (
            <Alert variant="destructive" className="mb-8 max-w-2xl mx-auto">
              {error || (errorType === 'CredentialsSignin' ? 'Authentication failed. Please try again.' : 'An error occurred during sign in.')}
            </Alert>
          )}

          {/* Success Message */}
          {message && (
            <Alert className="mb-8 max-w-2xl mx-auto border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              {message}
            </Alert>
          )}

          <div className="max-w-md mx-auto space-y-8">

            {/* Nostr-First Authentication */}
            {authConfigClient.features.showNostrProvider && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <NostrichIcon className="h-4 w-4 text-purple-500" />
                  <span>Nostr-First (your Nostr profile is source of truth)</span>
                </div>
                
                <div className="space-y-3 pl-6 border-l-2 border-purple-500/20">
                  <div className="relative">
                    <Button 
                      onClick={handleNostrSignIn}
                      className="w-full h-12 text-base"
                      size="lg"
                      disabled={isNostrLoading}
                    >
                      <NostrichIcon className="h-5 w-5 mr-3 text-purple-500" />
                      {isNostrLoading ? copy.nostrCard.loadingButton : copy.nostrCard.button}
                      {!isNostrLoading && <ArrowRight className="ml-auto h-4 w-4" />}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="absolute -right-8 lg:-right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={5} className="max-w-xs lg:max-w-sm" align="end">
                        <div className="space-y-2">
                          <p className="font-medium">{copy.nostrCard.title}</p>
                          <p className="text-sm">{copy.nostrCard.description}</p>
                          <p className="text-xs text-muted-foreground">{copy.nostrCard.helpText}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}

            {/* OAuth-First Authentication */}
            {(authConfigClient.features.showGithubProvider || authConfigClient.features.showEmailProvider) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Shield className="h-4 w-4 text-blue-500" />
                  <span>OAuth-First (traditional login + background Nostr)</span>
                </div>
                
                <div className="space-y-3 pl-6 border-l-2 border-blue-500/20">
                  {/* GitHub Authentication */}
                  {authConfigClient.features.showGithubProvider && (
                    <div className="relative">
                      <Button 
                        onClick={handleGithubSignIn}
                        className="w-full h-12 text-base"
                        variant="outline"
                        size="lg"
                        disabled={isGithubLoading}
                      >
                        <Github className="h-5 w-5 mr-3" />
                        {isGithubLoading ? copy.githubCard.loadingButton : copy.githubCard.button}
                        {!isGithubLoading && <ArrowRight className="ml-auto h-4 w-4" />}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="absolute -right-8 lg:-right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer">
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={5} className="max-w-xs lg:max-w-sm" align="end">
                          <div className="space-y-1">
                            <p className="font-medium">{copy.githubCard.title}</p>
                            <p className="text-sm">{copy.githubCard.description}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  {/* Email Form */}
                  {authConfigClient.features.showEmailProvider && (
                    <div className="relative space-y-3">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-dashed" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">Or with email</span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        className="w-full h-12 text-base"
                        variant="outline"
                        size="lg"
                        onClick={() => setShowEmailForm((prev) => !prev)}
                      >
                        <Mail className="h-5 w-5 mr-3" />
                        {showEmailForm ? 'Hide email' : 'Continue with email'}
                        <ChevronDown
                          className={cn('ml-auto h-4 w-4 transition-transform', showEmailForm ? '-rotate-180' : 'rotate-0')}
                        />
                      </Button>

                      {showEmailForm && (
                        <form onSubmit={handleEmailSignIn} className="space-y-3 relative">
                          <Input
                            type="email"
                            placeholder={copy.emailCard.placeholder}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                            className="h-12 text-base"
                          />
                          <Button 
                            type="submit" 
                            className="w-full h-12 text-base"
                            variant="outline"
                            size="lg"
                            disabled={isLoading || !email}
                          >
                            <Mail className="h-5 w-5 mr-3" />
                            {isLoading ? copy.emailCard.loadingButton : copy.emailCard.button}
                            {!isLoading && <ArrowRight className="ml-auto h-4 w-4" />}
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="absolute -right-8 lg:-right-10 top-6 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer">
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={5} className="max-w-xs lg:max-w-sm" align="end">
                              <div className="space-y-1">
                                <p className="font-medium">{copy.emailCard.title}</p>
                                <p className="text-sm">{copy.emailCard.description}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Anonymous Access */}
            {authConfigClient.features.showAnonymousProvider && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <UserX className="h-4 w-4 text-green-500" />
                  <span>Anonymous Access (quickstart, lowest friction)</span>
                </div>
                
                <div className="space-y-3 pl-6 border-l-2 border-green-500/20">
                  <div className="relative">
                    <Button 
                      onClick={handleAnonymousSignIn}
                      className="w-full h-12 text-base"
                      variant="outline"
                      size="lg"
                      disabled={isAnonymousLoading}
                    >
                      <UserX className="h-5 w-5 mr-3 text-green-500" />
                      {anonymousButtonLabel}
                      {!isAnonymousLoading && <ArrowRight className="ml-auto h-4 w-4" />}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="absolute -right-8 lg:-right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={5} className="max-w-xs lg:max-w-sm" align="end">
                        <div className="space-y-2">
                          <p className="font-medium">{copy.anonymousCard.title}</p>
                          <p className="text-sm">{anonymousDescription}</p>
                          <p className="text-xs text-muted-foreground">{copy.anonymousCard.helpText}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    {anonymousResumeFailed && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <p>
                          We could not reopen the cached anonymous account. Please retry or reset the cached key to start fresh.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetAnonymousIdentity}
                          className="mt-1 font-semibold text-primary hover:underline"
                        >
                          Reset anonymous identity (clears cached key)
                        </button>
                      </div>
                    )}
                    {hasCachedAnonymousIdentity && !anonymousResumeFailed && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <p>We found an anonymous account saved in this browser.</p>
                        <button
                          type="button"
                          onClick={handleResetAnonymousIdentity}
                          className="mt-1 font-semibold text-primary hover:underline"
                        >
                          Reset anonymous identity (clears cached key)
                        </button>
                      </div>
                    )}
                    {!hasPersistedAnonymousIdentity && !anonymousResumeFailed && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Generates a fresh anonymous keypair and stores it only in this browser.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recovery Section (collapsed by default) */}
            {authConfigClient.features.showRecoveryProvider && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-500" />
                    <span>Account Recovery</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => setShowRecovery((prev) => !prev)}
                  >
                    {showRecovery ? 'Hide' : 'Show'}
                    <ChevronDown
                      className={cn('ml-2 h-4 w-4 transition-transform', showRecovery ? '-rotate-180' : 'rotate-0')}
                    />
                  </Button>
                </div>

                {showRecovery && (
                  <div className="space-y-3 pl-6 border-l-2 border-amber-500/20">
                    <Card className="border-dashed relative">
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="text-center space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <Zap className="h-6 w-6 text-orange-500" />
                              <KeyRound className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-medium">{copy.recoveryCard.title}</h3>
                            <p className="text-sm text-muted-foreground">{copy.recoveryCard.description}</p>
                          </div>
                          
                          <form onSubmit={handleRecoverySignIn} className="space-y-3">
                            <Input
                              type="password"
                              placeholder={copy.recoveryCard.placeholder}
                              value={privateKey}
                              onChange={(e) => setPrivateKey(e.target.value)}
                              required
                              disabled={isRecoveryLoading}
                              className="h-11 font-mono text-sm"
                            />
                            <Button 
                              type="submit" 
                              className="w-full h-11"
                              variant="outline"
                              disabled={isRecoveryLoading || !privateKey}
                            >
                              {isRecoveryLoading ? copy.recoveryCard.loadingButton : copy.recoveryCard.button}
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </form>
                          
                          <p className="text-xs text-muted-foreground text-center">
                            {copy.recoveryCard.helpText}
                          </p>
                        </div>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="absolute right-3 top-3 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer">
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={5} className="max-w-xs lg:max-w-sm" align="end">
                            <div className="space-y-2">
                              <p className="font-medium">Account Recovery Details</p>
                              <p className="text-sm">Supported formats: {authConfigClient.providers?.recovery?.supportedFormats?.join(', ') || 'hex, nsec'}</p>
                              <p className="text-xs text-muted-foreground">{authConfigClient.providers?.recovery?.description || copy.recoveryCard.helpText}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* Footer Links */}
            <div className="text-center space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link href="/" className="text-primary hover:underline font-medium">
                  Get started for free
                </Link>
              </p>
              
              {authConfigClient.features.requireTermsAcceptance && (
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {copy.termsText}
                </p>
              )}
              
              <div className="flex items-center justify-center space-x-4 text-xs text-muted-foreground">
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <span>•</span>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <span>•</span>
                <Link href="/support" className="hover:text-foreground transition-colors">Help</Link>
              </div>
            </div>
          </div>
        </Section>
      </Container>
    </div>
    </TooltipProvider>
  )
} 
