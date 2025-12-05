'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Link2, LinkIcon, Unlink, Shield, Mail, Github, Key, User } from 'lucide-react'
import { NostrichIcon } from '@/components/icons'
import { getProviderDisplayName } from '@/lib/account-linking'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dispatchProfileUpdatedEvent } from '@/lib/profile-events'
import { LinkedAccountsSkeleton } from '@/app/profile/components/profile-skeletons'

interface LinkedAccount {
  provider: string
  isPrimary: boolean
  createdAt: Date
}

interface LinkedAccountsData {
  accounts: LinkedAccount[]
  primaryProvider: string | null
  profileSource: string | null
}

export function LinkedAccountsManager() {
  const router = useRouter()
  const { data: session, update: updateSession } = useSession()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<LinkedAccountsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null)
  const [changingPrimary, setChangingPrimary] = useState(false)
  const [providerToUnlink, setProviderToUnlink] = useState<string | null>(null)
  const [nostrUnlinkAcknowledged, setNostrUnlinkAcknowledged] = useState(false)

  const refreshAggregatedProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/profile/aggregated', { cache: 'no-store' })
      if (response.ok) {
        const profile = await response.json()
        dispatchProfileUpdatedEvent({
          name: profile?.name?.value ?? null,
          username: profile?.username?.value ?? null,
          image: profile?.image?.value ?? null
        })
      } else {
        console.warn('Failed to refresh aggregated profile: non-OK response')
        dispatchProfileUpdatedEvent()
      }
    } catch (aggregateError) {
      console.error('Failed to refresh aggregated profile after account change:', aggregateError)
      dispatchProfileUpdatedEvent()
    }
  }, [])

  // Fetch linked accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/account/linked')
      if (response.ok) {
        const data = await response.json()
        setAccounts(data)
      } else {
        toast({
          title: 'Error',
          description: 'Failed to fetch linked accounts',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch linked accounts',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const applyAccountStateUpdates = useCallback(async (options?: { redirectToProfile?: boolean }) => {
    await fetchAccounts()
    await refreshAggregatedProfile()
    try {
      await updateSession()
    } catch (sessionError) {
      console.error('Failed to refresh session after account change:', sessionError)
    }
    if (options?.redirectToProfile) {
      router.replace('/profile')
      return
    }
    router.refresh()
  }, [fetchAccounts, refreshAggregatedProfile, router, updateSession])

  // Handle OAuth callback messages
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'github_linked' || success === 'email_linked') {
      // ProfileTabs already surfaces the GitHub toast, so only toast here for other providers
      if (success !== 'github_linked') {
        toast({
          title: 'Success',
          description: 'Email account linked successfully'
        })
      }

      // Clear URL immediately to prevent effect from re-running during async work
      window.history.replaceState({}, '', '/profile')
      
      // Then perform async work (fetch accounts and refresh session)
      ;(async () => {
        await applyAccountStateUpdates({ redirectToProfile: true })
      })()
    } else if (error) {
      let errorMessage = 'Failed to link account'
      switch(error) {
        case 'session_mismatch':
          errorMessage = 'Session mismatch. Please try again.'
          break
        case 'token_exchange_failed':
          errorMessage = 'Failed to authenticate with GitHub'
          break
        case 'user_fetch_failed':
          errorMessage = 'Failed to get GitHub user information'
          break
        case 'This account is already linked to another user':
          errorMessage = 'This GitHub account is already linked to another user'
          break
        case 'You already have a github account linked':
          errorMessage = 'You already have a GitHub account linked'
          break
        case 'invalid_token':
          errorMessage = 'Invalid verification link. Please request a new one.'
          break
        case 'token_expired':
          errorMessage = 'Verification link has expired. Please request a new one.'
          break
        case 'token_mismatch':
          errorMessage = 'Verification link mismatch. Please request a new one.'
          break
        case 'verification_error':
          errorMessage = 'Email verification failed. Please try again.'
          break
        default:
          if (error.includes('already')) {
            errorMessage = error
          }
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
      // Clean up URL params
      window.history.replaceState({}, '', '/profile?tab=accounts')
    }
  }, [searchParams, toast, applyAccountStateUpdates])

  // Unlink account
  const handleUnlink = async (provider: string) => {
    setUnlinkingProvider(provider)
    try {
      const response = await fetch('/api/account/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${getProviderDisplayName(provider)} account unlinked successfully`
        })
        await applyAccountStateUpdates()
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to unlink account',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to unlink account:', error)
      toast({
        title: 'Error',
        description: 'Failed to unlink account',
        variant: 'destructive'
      })
    } finally {
      setUnlinkingProvider(null)
      setProviderToUnlink(null)
    }
  }

  // Change primary provider
  const handleChangePrimary = async (provider: string) => {
    setChangingPrimary(true)
    try {
      const response = await fetch('/api/account/primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Success',
          description: `${getProviderDisplayName(provider)} is now your primary authentication method`
        })
        await applyAccountStateUpdates()
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to change primary provider',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to change primary provider:', error)
      toast({
        title: 'Error',
        description: 'Failed to change primary provider',
        variant: 'destructive'
      })
    } finally {
      setChangingPrimary(false)
    }
  }

  // Get provider icon
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'nostr':
        return <NostrichIcon className="h-4 w-4 text-purple-500" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'github':
        return <Github className="h-4 w-4" />
      case 'anonymous':
        return <User className="h-4 w-4" />
      case 'recovery':
        return <Shield className="h-4 w-4" />
      default:
        return <LinkIcon className="h-4 w-4" />
    }
  }

  // Available providers that can be linked
  // Note: We exclude 'anonymous' and 'recovery' as they are not meant to be linked as additional accounts
  const availableProviders = ['nostr', 'email', 'github']
  const linkedProviders = accounts?.accounts.map(a => a.provider) || []
  const unlinkableProviders = availableProviders.filter(p => !linkedProviders.includes(p))
  
  // Get the current session provider - this will be used to disable the corresponding button
  const currentProvider = session?.provider || null

  useEffect(() => {
    if (!providerToUnlink) {
      setNostrUnlinkAcknowledged(false)
    }
  }, [providerToUnlink])

  if (loading) {
    return <LinkedAccountsSkeleton />
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Linked Accounts</CardTitle>
          <CardDescription>
            Manage your authentication methods and choose which profile source to use.
            {accounts?.profileSource === 'nostr' ? (
              <span className="block mt-2 text-sm font-medium">
                Profile syncs from Nostr on every login
              </span>
            ) : (
              <span className="block mt-2 text-sm font-medium">
                Profile uses OAuth provider data
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts?.accounts.map((account) => (
            <div key={account.provider} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                {getProviderIcon(account.provider)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{getProviderDisplayName(account.provider)}</span>
                    {account.isPrimary && (
                      <Badge variant="default" className="text-xs">Primary</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Connected on {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!account.isPrimary && accounts.accounts.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChangePrimary(account.provider)}
                    disabled={changingPrimary}
                  >
                    {changingPrimary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Make Primary'
                    )}
                  </Button>
                )}
                {accounts.accounts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProviderToUnlink(account.provider)}
                    disabled={unlinkingProvider === account.provider}
                  >
                    {unlinkingProvider === account.provider ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}

          {unlinkableProviders.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Link Additional Accounts</h4>
                <p className="text-sm text-muted-foreground">
                  Add more ways to sign in to your account
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {unlinkableProviders.map((provider) => (
                    <LinkProviderButton 
                      key={provider} 
                      provider={provider} 
                      onLinked={() => applyAccountStateUpdates({ redirectToProfile: true })}
                      isCurrentProvider={provider === currentProvider}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Unlink confirmation dialog */}
      <AlertDialog
        open={!!providerToUnlink}
        onOpenChange={(open) => {
          if (!open) {
            setProviderToUnlink(null)
            setNostrUnlinkAcknowledged(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {providerToUnlink && getProviderDisplayName(providerToUnlink)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Are you sure you want to unlink this authentication method? You can always link it again later.
                </p>
                {accounts?.accounts.length === 2 && (
                  <p className="font-medium">
                    Note: You cannot unlink your last authentication method.
                  </p>
                )}
                {providerToUnlink === 'nostr' && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-purple-900 dark:border-purple-400/30 dark:bg-purple-950/30 dark:text-purple-50">
                    <p className="text-sm font-medium">
                      Disconnecting your self-custodied Nostr login means we will mint a new encrypted key pair so the app can keep signing background Nostr events (just like email/GitHub users).
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border border-purple-500 accent-purple-600"
                        checked={nostrUnlinkAcknowledged}
                        onChange={(event) => setNostrUnlinkAcknowledged(event.target.checked)}
                      />
                      <span>I understand and consent to an ephemeral Nostr key pair being generated for my account.</span>
                    </label>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !providerToUnlink ||
                unlinkingProvider === providerToUnlink ||
                (providerToUnlink === 'nostr' && !nostrUnlinkAcknowledged)
              }
              onClick={() => providerToUnlink && handleUnlink(providerToUnlink)}
            >
              {unlinkingProvider === providerToUnlink ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlinking...
                </>
              ) : (
                'Unlink Account'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface LinkProviderButtonProps {
  provider: string
  onLinked: () => void | Promise<void>
  isCurrentProvider?: boolean
}

function LinkProviderButton({ provider, onLinked, isCurrentProvider = false }: LinkProviderButtonProps) {
  const { toast } = useToast()
  const [linking, setLinking] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)

  const handleLink = async () => {
    setLinking(true)
    
    // Different linking flows for different providers
    if (provider === 'nostr') {
      // For Nostr, we need to get the user's pubkey via NIP-07
      if (!window.nostr) {
        toast({
          title: 'Nostr Extension Required',
          description: 'Please install a Nostr browser extension like Alby or nos2x',
          variant: 'destructive'
        })
        setLinking(false)
        return
      }

      try {
        const pubkey = await window.nostr.getPublicKey()
        
        const response = await fetch('/api/account/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'nostr',
            providerAccountId: pubkey
          })
        })

        const data = await response.json()

        if (response.ok) {
          toast({
            title: 'Success',
            description: 'Nostr account linked successfully'
          })
          await onLinked()
        } else {
          toast({
            title: 'Error',
            description: data.error || 'Failed to link Nostr account',
            variant: 'destructive'
          })
        }
      } catch (error) {
        console.error('Failed to link Nostr account:', error)
        toast({
          title: 'Error',
          description: 'Failed to get public key from Nostr extension',
          variant: 'destructive'
        })
      }
    } else if (provider === 'email') {
      // For email, show a dialog to enter email address
      setShowEmailDialog(true)
      setLinking(false)
      return
    } else if (provider === 'github') {
      // For GitHub, use our OAuth linking flow
      if (typeof window !== 'undefined') {
        window.location.href = '/api/account/link-oauth?provider=github'
      }
    }
    
    setLinking(false)
  }

  const handleEmailLink = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
    if (!emailRegex.test(normalizedEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive'
      })
      return
    }

    setEmailSending(true)
    try {
      // Send verification email for account linking
      const response = await fetch('/api/account/send-link-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Verification Email Sent',
          description: `We've sent a verification link to ${normalizedEmail}. Please check your inbox and click the link to complete linking.`,
        })
        setShowEmailDialog(false)
        setEmail('')
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to send verification email',
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to send verification email:', error)
      toast({
        title: 'Error',
        description: 'Failed to send verification email',
        variant: 'destructive'
      })
    } finally {
      setEmailSending(false)
    }
  }

  const getIcon = () => {
    switch (provider) {
      case 'nostr':
        return <Key className="h-4 w-4" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'github':
        return <Github className="h-4 w-4" />
      default:
        return <Link2 className="h-4 w-4" />
    }
  }

  // If this is the current provider, wrap in tooltip and disable
  if (isCurrentProvider) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                disabled={true}
                className="gap-2 opacity-50 cursor-not-allowed"
              >
                {getIcon()}
                Link {getProviderDisplayName(provider)}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>You are currently signed in with {getProviderDisplayName(provider)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleLink}
        disabled={linking}
        className="gap-2"
      >
        {linking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          getIcon()
        )}
        Link {getProviderDisplayName(provider)}
      </Button>

      {/* Email linking dialog */}
      {provider === 'email' && (
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Link Email Account</DialogTitle>
              <DialogDescription>
                Enter the email address you want to link to your account. 
                This email must not be already linked to another account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="col-span-3"
                  disabled={emailSending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEmailDialog(false)
                  setEmail('')
                }}
                disabled={emailSending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEmailLink}
                disabled={emailSending || !email}
              >
                {emailSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Linking...
                  </>
                ) : (
                  'Link Email'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
