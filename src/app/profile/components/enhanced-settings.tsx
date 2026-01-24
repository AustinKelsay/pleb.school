'use client'

import { useState, useEffect, useTransition } from 'react'
import { Session } from 'next-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { 
  Save, 
  Loader2, 
  Info, 
  AlertTriangle, 
  CheckCircle,
  Key,
  Mail,
  GitBranch,
  User,
  Link2,
  RefreshCw,
  Shield,
  Globe,
  Settings,
  WifiOff,
  ServerCrash,
  RotateCcw
} from 'lucide-react'
import { updateBasicProfile, updateEnhancedProfile, updateAccountPreferences, type BasicProfileData, type EnhancedProfileData, type SignedKind0Event } from '../actions'
import { prepareSignedNostrProfile } from '@/lib/nostr-profile-signing'
import type { AggregatedProfile } from '@/lib/profile-aggregator'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ProfileSettingsSkeleton } from '@/app/profile/components/profile-skeletons'

interface EnhancedSettingsProps {
  session: Session
}

const providerIcons = {
  nostr: Key,
  github: GitBranch,
  email: Mail,
  current: User,
  profile: User
}

const providerLabels = {
  nostr: 'Nostr',
  github: 'GitHub',
  email: 'Email',
  current: 'Current Session',
  profile: 'Profile'
}

const fieldDescriptions = {
  basicProfile: 'Core fields stored in our database. OAuth-first users can edit them directly.',
  basicName: 'Displayed on your profile whenever OAuth data is authoritative.',
  basicEmail: 'Used for login + notifications and never shown publicly.',
  enhancedProfile: 'Nostr metadata (NIP-05, Lightning, banner) that augments your public profile.',
  nip05: 'DNS-based identifier (user@domain.com) that maps to your Nostr public key.',
  lud16: 'Lightning address that fans can use to send you tips.',
  banner: 'Hero image URL rendered at the top of your profile.',
  accountConfig: 'Tune how different providers contribute to your profile data.',
  profileSource: 'Controls which provider wins when multiple sources provide the same field.',
  primaryProvider: 'Determines which linked account is treated as your main authentication method.',
  autoSync: 'When enabled, we automatically refresh data from your primary provider after each sign-in.',
  currentConfiguration: 'Snapshot of the active provider preferences.',
  syncOptions: 'Manually pull profile data from any linked provider on demand.'
}

// Error types for better error handling
type ErrorType = 'network' | 'server' | 'validation' | 'permission' | 'unknown'

interface ErrorDetails {
  type: ErrorType
  message: string
  suggestion?: string
  canRetry?: boolean
}

export function EnhancedSettings({ session }: EnhancedSettingsProps) {
  const { user } = session
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ 
    type: 'success' | 'error' | 'info'
    text: string
    details?: ErrorDetails
    onRetry?: () => void
  } | null>(null)
  const [aggregatedProfile, setAggregatedProfile] = useState<AggregatedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'sync'>('profile')
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState<Record<string, number>>({})
  
  // Form states
  const [basicProfile, setBasicProfile] = useState<BasicProfileData>({
    name: '',
    email: ''
  })

  const [enhancedProfile, setEnhancedProfile] = useState<EnhancedProfileData>({
    nip05: '',
    lud16: '',
    banner: ''
  })

  const [accountPrefs, setAccountPrefs] = useState({
    profileSource: '',
    primaryProvider: '',
    autoSync: false
  })

  const [nostrProfile, setNostrProfile] = useState<Record<string, any> | null>(null)
  const [nostrProfileStatus, setNostrProfileStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    user.pubkey ? 'loading' : 'success'
  )

  // Fetch aggregated profile data
  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch('/api/profile/aggregated')
        if (response.ok) {
          const data = await response.json()
          setAggregatedProfile(data)
          
          // Initialize form data
          setBasicProfile({
            name: data.name?.value || user.name || '',
            email: data.email?.value || user.email || ''
          })
          
          setEnhancedProfile({
            nip05: data.nip05?.value || user.nip05 || '',
            lud16: data.lud16?.value || user.lud16 || '',
            banner: data.banner?.value || user.banner || ''
          })
          
          setAccountPrefs({
            profileSource: data.profileSource || 'oauth',
            primaryProvider: data.primaryProvider || 'current',
            autoSync: false
          })
        }
      } catch (error) {
        console.error('Failed to fetch aggregated profile:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchProfile()
  }, [user])

  useEffect(() => {
    if (!user.pubkey) {
      setNostrProfileStatus('success')
      return
    }

    let cancelled = false

    async function fetchNostrMetadata() {
      setNostrProfileStatus('loading')
      try {
        const response = await fetch('/api/profile/nostr')
        if (!response.ok) {
          throw new Error('Failed to load Nostr profile metadata')
        }
        const data = await response.json()
        if (!cancelled) {
          setNostrProfile(data?.profile || null)
          setNostrProfileStatus('success')
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch Nostr profile metadata:', error)
          setNostrProfileStatus('error')
        }
      }
    }

    fetchNostrMetadata()
    return () => {
      cancelled = true
    }
  }, [user.pubkey])

  const derivedNostrFirst = aggregatedProfile
    ? aggregatedProfile.profileSource === 'nostr' ||
      (!aggregatedProfile.profileSource && aggregatedProfile.primaryProvider === 'nostr')
    : !user.hasEphemeralKeys

  const isNostrFirst = derivedNostrFirst
  const canEditBasic = !isNostrFirst
  const requiresSignedEvent = !!user.pubkey && !user.hasEphemeralKeys

  const normalizeField = (value: string | null | undefined): string | null | undefined => {
    if (value === undefined || value === null) return undefined
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  }

  const buildNormalizedEnhancedProfile = (): EnhancedProfileData => ({
    nip05: normalizeField(enhancedProfile.nip05 as string | null | undefined),
    lud16: normalizeField(enhancedProfile.lud16 as string | null | undefined),
    banner: normalizeField(enhancedProfile.banner as string | null | undefined)
  })

  const handleBasicSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEditBasic) return

    startTransition(async () => {
      try {
        const result = await updateBasicProfile(basicProfile)
        
        if (result.success) {
          setMessage({ type: 'success', text: result.message })
          setTimeout(() => setMessage(null), 5000)
        } else {
          setMessage({ type: 'error', text: result.message })
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to update basic profile' })
      }
    })
  }

  const handleEnhancedSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const normalizedData = buildNormalizedEnhancedProfile()

    startTransition(async () => {
      let signedEvent: SignedKind0Event | undefined

      if (requiresSignedEvent) {
        if (nostrProfileStatus === 'loading') {
          setMessage({ type: 'error', text: 'Still loading your Nostr metadata. Please try again shortly.' })
          return
        }

        if (nostrProfileStatus === 'error' && !nostrProfile) {
          setMessage({ type: 'error', text: 'Unable to load your existing Nostr metadata. Refresh and try again.' })
          return
        }

        try {
          const { signedEvent: signed, updatedProfile } = await prepareSignedNostrProfile({
            user,
            nostrProfile,
            updates: {
              nip05: normalizedData.nip05 as string | null | undefined,
              lud16: normalizedData.lud16 as string | null | undefined,
              banner: normalizedData.banner as string | null | undefined,
            },
          })
          signedEvent = signed
          setNostrProfile(updatedProfile)
        } catch (error) {
          setMessage({ 
            type: 'error', 
            text: error instanceof Error ? error.message : 'Failed to sign profile update.' 
          })
          return
        }
      }

      try {
        const result = await updateEnhancedProfile({
          ...normalizedData,
          signedEvent
        })
        
        if (!result.success) {
          setMessage({ type: 'error', text: result.message })
          return
        }

        if (requiresSignedEvent && !result.publishedToNostr) {
          setMessage({ 
            type: 'error', 
            text: 'Profile changes were not published to Nostr relays. Please retry.' 
          })
          return
        }

        if (result.nostrProfile) {
          setNostrProfile(result.nostrProfile)
        }

        const messageType: 'success' | 'info' = result.publishedToNostr ? 'success' : 'info'
        const messageText = result.publishedToNostr
          ? result.message
          : `${result.message || 'Enhanced profile updated locally.'} Nostr relays were not updated.`

        setMessage({ type: messageType, text: messageText })
        setTimeout(() => setMessage(null), 7000)
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to update enhanced profile' })
      }
    })
  }

  const handleAccountPrefsSubmit = async () => {
    startTransition(async () => {
      try {
        const result = await updateAccountPreferences({
          profileSource: accountPrefs.profileSource as 'nostr' | 'oauth',
          primaryProvider: accountPrefs.primaryProvider
        })
        
        if (result.success) {
          setMessage({ type: 'success', text: result.message })
          setTimeout(() => setMessage(null), 5000)
          // Refresh the page to reflect changes
          window.location.reload()
        } else {
          setMessage({ type: 'error', text: result.message })
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to update account preferences' })
      }
    })
  }

  // Helper function to determine error type and provide suggestions
  const analyzeError = (error: unknown): ErrorDetails => {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        type: 'network',
        message: 'Network connection failed',
        suggestion: 'Please check your internet connection and try again.',
        canRetry: true
      }
    }
    
    if (error instanceof Error) {
      // Timeout errors
      if (error.name === 'AbortError' || error.message.includes('abort')) {
        return {
          type: 'network',
          message: 'Request timed out',
          suggestion: 'The server is taking too long to respond. Please try again.',
          canRetry: true
        }
      }
      
      // Network errors
      if (error.message.includes('NetworkError') || 
          error.message.includes('Failed to fetch') ||
          error.message.includes('net::')) {
        return {
          type: 'network',
          message: 'Unable to connect to the server',
          suggestion: 'Check your internet connection or try again in a few moments.',
          canRetry: true
        }
      }
      
      // Server errors
      if (error.message.includes('500') || 
          error.message.includes('502') || 
          error.message.includes('503')) {
        return {
          type: 'server',
          message: 'Server error occurred',
          suggestion: 'The server is experiencing issues. Please try again later.',
          canRetry: true
        }
      }
      
      // Permission errors
      if (error.message.includes('401') || 
          error.message.includes('403') ||
          error.message.includes('Unauthorized') ||
          error.message.includes('not linked')) {
        return {
          type: 'permission',
          message: error.message,
          suggestion: 'You may need to re-authenticate or link this provider first.',
          canRetry: false
        }
      }
      
      // Validation errors
      if (error.message.includes('400') || 
          error.message.includes('Invalid') ||
          error.message.includes('validation')) {
        return {
          type: 'validation',
          message: error.message,
          suggestion: 'Please check your input and try again.',
          canRetry: false
        }
      }
    }
    
    return {
      type: 'unknown',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      suggestion: 'Please try again. If the problem persists, contact support.',
      canRetry: true
    }
  }

  const syncFromProvider = async (provider: string, isRetry: boolean = false) => {
    setSyncingProvider(provider)
    
    // Update retry count
    const currentRetryCount = retryCount[provider] || 0
    if (isRetry) {
      setRetryCount(prev => ({ ...prev, [provider]: currentRetryCount + 1 }))
      
      // Exponential backoff: wait before retrying
      const backoffDelay = Math.min(1000 * Math.pow(2, currentRetryCount), 10000) // Max 10 seconds
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
    } else {
      setRetryCount(prev => ({ ...prev, [provider]: 0 }))
    }
    
    setMessage({ 
      type: 'info', 
      text: isRetry 
        ? `Retrying sync from ${providerLabels[provider as keyof typeof providerLabels]} (Attempt ${currentRetryCount + 1})...`
        : `Syncing from ${providerLabels[provider as keyof typeof providerLabels]}...`
    })
    
    try {
      // Add timeout for better error handling
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch('/api/profile/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Sync failed with status ${response.status}`)
      }

      // Update local state with synced profile data
      if (data.profile) {
        // Update basic profile if changed
        if (data.profile.name !== undefined || data.profile.email !== undefined) {
          setBasicProfile(prev => ({
            ...prev,
            name: data.profile.name || prev.name,
            email: data.profile.email || prev.email
          }))
        }

        // Update enhanced profile if changed
        if (data.profile.nip05 !== undefined || data.profile.lud16 !== undefined || data.profile.banner !== undefined) {
          setEnhancedProfile(prev => ({
            ...prev,
            nip05: data.profile.nip05 || prev.nip05,
            lud16: data.profile.lud16 || prev.lud16,
            banner: data.profile.banner || prev.banner
          }))
        }
      }

      // Reset retry count on success
      setRetryCount(prev => ({ ...prev, [provider]: 0 }))
      
      setMessage({ 
        type: 'success', 
        text: data.message || `Successfully synced profile from ${providerLabels[provider as keyof typeof providerLabels]}` 
      })
      
      // Refresh aggregated profile data
      try {
        const aggregatedResponse = await fetch('/api/profile/aggregated')
        if (aggregatedResponse.ok) {
          const aggregatedData = await aggregatedResponse.json()
          setAggregatedProfile(aggregatedData)
        }
      } catch (aggregateError) {
        console.warn('Failed to refresh aggregated profile:', aggregateError)
        // Don't fail the whole operation if aggregate refresh fails
      }

      setTimeout(() => setMessage(null), 5000)
    } catch (error) {
      console.error('Profile sync error:', error)
      
      const errorDetails = analyzeError(error)
      const maxRetries = 3
      const currentRetries = retryCount[provider] || 0
      
      // Determine if we should offer retry
      const canRetry = errorDetails.canRetry && currentRetries < maxRetries
      
      setMessage({ 
        type: 'error', 
        text: `Failed to sync from ${providerLabels[provider as keyof typeof providerLabels]}`,
        details: errorDetails,
        onRetry: canRetry ? () => syncFromProvider(provider, true) : undefined
      })
      
      // Don't auto-dismiss error messages
      if (!canRetry) {
        setTimeout(() => setMessage(null), 10000)
      }
    } finally {
      setSyncingProvider(null)
    }
  }

  if (loading) {
    return <ProfileSettingsSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground">
            Manage your profile, account preferences, and sync options
          </p>
        </div>
        
        <div className="flex gap-2 border-b">
          <Button
            variant={activeTab === 'profile' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('profile')}
            className="rounded-b-none"
          >
            <User className="mr-2 h-4 w-4" />
            Profile Fields
          </Button>
          <Button
            variant={activeTab === 'account' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('account')}
            className="rounded-b-none"
          >
            <Settings className="mr-2 h-4 w-4" />
            Account Preferences
          </Button>
          <Button
            variant={activeTab === 'sync' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('sync')}
            className="rounded-b-none"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync Options
          </Button>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              {message.type === 'error' && message.details?.type === 'network' && <WifiOff className="h-4 w-4" />}
              {message.type === 'error' && message.details?.type === 'server' && <ServerCrash className="h-4 w-4" />}
              {message.type === 'error' && !['network', 'server'].includes(message.details?.type || '') && <AlertTriangle className="h-4 w-4" />}
              {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
              {message.type === 'info' && <Info className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <AlertDescription className="font-medium">{message.text}</AlertDescription>
              {message.details && (
                <div className="mt-2 space-y-2">
                  {message.details.suggestion && (
                    <p className="text-sm text-muted-foreground">
                      {message.details.suggestion}
                    </p>
                  )}
                  {message.onRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        message.onRetry?.()
                        setMessage(null)
                      }}
                      className="mt-2"
                    >
                      <RotateCcw className="mr-2 h-3 w-3" />
                      Try Again
                    </Button>
                  )}
                </div>
              )}
            </div>
            {!message.onRetry && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMessage(null)}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            )}
          </div>
        </Alert>
      )}

      {/* Profile Fields Tab */}
      {activeTab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Basic Profile Form */}
          <Card className={!canEditBasic ? 'opacity-50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  Basic Profile
                  <InfoTooltip content={fieldDescriptions.basicProfile} />
                </span>
                {aggregatedProfile?.name && (
                  <Badge variant="outline" className="text-xs">
                    From: {providerLabels[aggregatedProfile.name.source as keyof typeof providerLabels]}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {canEditBasic ? 'Update your basic profile information' : 'Managed via Nostr profile'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBasicSubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      Name
                      <InfoTooltip content={fieldDescriptions.basicName} />
                    </span>
                    {aggregatedProfile?.name && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const Icon = providerIcons[aggregatedProfile.name.source as keyof typeof providerIcons] || Link2
                          return <Icon className="h-3 w-3" />
                        })()}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="name"
                    value={basicProfile.name}
                    onChange={(e) => setBasicProfile({ ...basicProfile, name: e.target.value })}
                    placeholder="Enter your name"
                    disabled={!canEditBasic}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      Email
                      <InfoTooltip content={fieldDescriptions.basicEmail} />
                    </span>
                    {aggregatedProfile?.email && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const Icon = providerIcons[aggregatedProfile.email.source as keyof typeof providerIcons] || Link2
                          return <Icon className="h-3 w-3" />
                        })()}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={basicProfile.email}
                    onChange={(e) => setBasicProfile({ ...basicProfile, email: e.target.value })}
                    placeholder="Enter your email"
                    disabled={!canEditBasic}
                  />
                </div>

                <Button type="submit" disabled={isPending || !canEditBasic} className="w-full">
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update Basic Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Enhanced Profile Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Enhanced Profile
                <InfoTooltip content={fieldDescriptions.enhancedProfile} />
              </CardTitle>
              <CardDescription>
                Nostr-related fields that complement your profile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEnhancedSubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="nip05" className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      NIP-05 Address
                      <InfoTooltip content={fieldDescriptions.nip05} />
                    </span>
                    {aggregatedProfile?.nip05 && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const Icon = providerIcons[aggregatedProfile.nip05.source as keyof typeof providerIcons] || Link2
                          return <Icon className="h-3 w-3" />
                        })()}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="nip05"
                    value={String(enhancedProfile.nip05 ?? '')}
                    onChange={(e) => setEnhancedProfile({ ...enhancedProfile, nip05: e.target.value })}
                    placeholder="user@domain.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="lud16" className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      Lightning Address
                      <InfoTooltip content={fieldDescriptions.lud16} />
                    </span>
                    {aggregatedProfile?.lud16 && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const Icon = providerIcons[aggregatedProfile.lud16.source as keyof typeof providerIcons] || Link2
                          return <Icon className="h-3 w-3" />
                        })()}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="lud16"
                    value={String(enhancedProfile.lud16 ?? '')}
                    onChange={(e) => setEnhancedProfile({ ...enhancedProfile, lud16: e.target.value })}
                    placeholder="user@wallet.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="banner" className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      Banner Image URL
                      <InfoTooltip content={fieldDescriptions.banner} />
                    </span>
                    {aggregatedProfile?.banner && (
                      <Badge variant="secondary" className="text-xs">
                        {(() => {
                          const Icon = providerIcons[aggregatedProfile.banner.source as keyof typeof providerIcons] || Link2
                          return <Icon className="h-3 w-3" />
                        })()}
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="banner"
                    value={String(enhancedProfile.banner ?? '')}
                    onChange={(e) => setEnhancedProfile({ ...enhancedProfile, banner: e.target.value })}
                    placeholder="https://example.com/banner.jpg"
                  />
                </div>

                <Button type="submit" disabled={isPending} className="w-full">
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Update Enhanced Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account Preferences Tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="mr-2 h-5 w-5" />
                Account Configuration
                <InfoTooltip content={fieldDescriptions.accountConfig} />
              </CardTitle>
              <CardDescription>
                Configure how your profile data is managed across providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Source Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Profile Source Priority</Label>
                  <InfoTooltip content={fieldDescriptions.profileSource} />
                </div>
                <RadioGroup
                  value={accountPrefs.profileSource}
                  onValueChange={(value) => setAccountPrefs({ ...accountPrefs, profileSource: value })}
                >
                  <div className="flex items-center space-x-2 p-3 rounded-lg border">
                    <RadioGroupItem value="nostr" id="nostr-first" />
                    <Label htmlFor="nostr-first" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Nostr-First</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your Nostr profile is the source of truth. OAuth providers are secondary.
                      </p>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border">
                    <RadioGroupItem value="oauth" id="oauth-first" />
                    <Label htmlFor="oauth-first" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-orange-500" />
                        <span className="font-medium">OAuth-First</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        OAuth providers (Email, GitHub) are primary. Nostr is secondary.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              {/* Primary Provider Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="primary-provider">Primary Provider</Label>
                  <InfoTooltip content={fieldDescriptions.primaryProvider} />
                </div>
                <Select
                  value={accountPrefs.primaryProvider}
                  onValueChange={(value) => setAccountPrefs({ ...accountPrefs, primaryProvider: value })}
                >
                  <SelectTrigger id="primary-provider">
                    <SelectValue placeholder="Select primary provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {aggregatedProfile?.linkedAccounts.map((account) => (
                      <SelectItem key={account.provider} value={account.provider}>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const Icon = providerIcons[account.provider as keyof typeof providerIcons] || Link2
                            return <Icon className="h-4 w-4" />
                          })()}
                          {providerLabels[account.provider as keyof typeof providerLabels] || account.provider}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  The primary provider is used for authentication and as the default data source.
                </p>
              </div>

              <Separator />

              {/* Auto Sync Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="auto-sync" className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    <span className="flex items-center gap-1">
                      Auto-Sync on Sign In
                      <InfoTooltip content={fieldDescriptions.autoSync} />
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically sync profile data from primary provider when signing in
                  </p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={accountPrefs.autoSync}
                  onCheckedChange={(checked) => setAccountPrefs({ ...accountPrefs, autoSync: checked })}
                />
              </div>

              <Button 
                onClick={handleAccountPrefsSubmit} 
                disabled={isPending} 
                className="w-full"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Preferences...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Account Preferences
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Current Configuration Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Current Configuration
                <InfoTooltip content={fieldDescriptions.currentConfiguration} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Profile Source:</span>
                  <Badge variant="outline">
                    {accountPrefs.profileSource === 'nostr' ? 'Nostr-First' : 'OAuth-First'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Primary Provider:</span>
                  <Badge variant="outline">
                    {providerLabels[accountPrefs.primaryProvider as keyof typeof providerLabels] || accountPrefs.primaryProvider}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total Linked Accounts:</span>
                  <Badge variant="outline">{aggregatedProfile?.totalLinkedAccounts || 0}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sync Options Tab */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="mr-2 h-5 w-5" />
                Profile Sync Options
                <InfoTooltip content={fieldDescriptions.syncOptions} />
              </CardTitle>
              <CardDescription>
                Sync your profile data between different providers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>How Profile Sync Works</AlertTitle>
                <AlertDescription>
                  You can pull profile data from any of your linked accounts. This will update your 
                  local profile with data from the selected provider. Your profile source setting 
                  determines which provider&apos;s data takes priority during automatic syncs.
                </AlertDescription>
              </Alert>

              {/* Sync from each provider */}
              <div className="space-y-3">
                {aggregatedProfile?.linkedAccounts.map((account) => (
                  <div key={account.provider} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        {(() => {
                          const Icon = providerIcons[account.provider as keyof typeof providerIcons] || Link2
                          return <Icon className="h-4 w-4" />
                        })()}
                      </div>
                      <div>
                        <p className="font-medium">
                          {providerLabels[account.provider as keyof typeof providerLabels] || account.provider}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {account.data.name || account.data.email || 'No profile data'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncFromProvider(account.provider)}
                      disabled={isPending || syncingProvider !== null}
                    >
                      {syncingProvider === account.provider ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Advanced Sync Options */}
              <div className="space-y-3">
                <h4 className="font-medium">Advanced Options</h4>
                
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    These options will overwrite your current profile data. Use with caution.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3">
                  <Button variant="outline" className="justify-start" disabled={isPending}>
                    <Globe className="mr-2 h-4 w-4" />
                    Export Profile Data
                  </Button>
                  <Button variant="outline" className="justify-start" disabled={isPending}>
                    <Shield className="mr-2 h-4 w-4" />
                    Reset to Default Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync History */}
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>
                Recent profile sync operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No sync history available
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
