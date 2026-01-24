'use client'

/**
 * Profile Edit Forms Component
 * 
 * Uses standard shadcn/ui components with minimal hardcoded styles.
 * Relies on configurable theme system for all styling.
 * 
 * Features:
 * - Standard shadcn form patterns
 * - Theme-aware Alert components
 * - Responsive grid layout using CSS utilities
 * - Default shadcn component spacing and typography
 */

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { Session } from 'next-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  Save, 
  Loader2, 
  Info, 
  AlertTriangle, 
  CheckCircle,
  X
} from 'lucide-react'
import { updateBasicProfile, updateEnhancedProfile, type BasicProfileData, type EnhancedProfileData } from '../actions'
import { dispatchProfileUpdatedEvent } from '@/lib/profile-events'

interface ProfileEditFormsProps {
  session: Session
  onClose?: () => void // Make optional since it's no longer always needed
  profileSource?: 'nostr' | 'oauth' | null
  primaryProvider?: string | null
}

export function ProfileEditForms({ session, onClose, profileSource, primaryProvider }: ProfileEditFormsProps) {
  const { user } = session
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  
  // Basic profile form state (OAuth-first only)
  const [basicProfile, setBasicProfile] = useState<BasicProfileData>({
    name: user.name || '',
    email: user.email || ''
  })
  const [basicProfileDirty, setBasicProfileDirty] = useState(false)
  const basicProfileDirtyRef = useRef(basicProfileDirty)
  useEffect(() => {
    basicProfileDirtyRef.current = basicProfileDirty
  }, [basicProfileDirty])

  useEffect(() => {
    let isMounted = true
    const refreshProfileDefaults = async () => {
      try {
        const response = await fetch('/api/profile/aggregated', { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const data = await response.json()
        if (!isMounted || !data) {
          return
        }

        setBasicProfile(prev => {
          if (basicProfileDirtyRef.current) {
            return prev
          }
          let changed = false
          const next = { ...prev }
          if (data.name?.value && data.name.value !== prev.name) {
            next.name = data.name.value
            changed = true
          }
          if (data.email?.value && data.email.value !== prev.email) {
            next.email = data.email.value
            changed = true
          }
          return changed ? next : prev
        })
      } catch (error) {
        console.error('Failed to refresh basic profile defaults:', error)
      }
    }

    refreshProfileDefaults()

    return () => {
      isMounted = false
    }
  }, [session.user.id])

  // Enhanced profile form state (all users)
  const [enhancedProfile, setEnhancedProfile] = useState<EnhancedProfileData>({
    nip05: user.nip05 || '',
    lud16: user.lud16 || '',
    banner: user.banner || ''
  })

  const broadcastProfileRefresh = useCallback(async () => {
    try {
      const response = await fetch('/api/profile/aggregated', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      dispatchProfileUpdatedEvent({
        name: data?.name?.value ?? null,
        username: data?.username?.value ?? null,
        image: data?.image?.value ?? null
      })
    } catch (error) {
      console.error('Failed to broadcast profile update', error)
    }
  }, [])

  const derivedProfileSource = profileSource || (!user.hasEphemeralKeys ? 'nostr' : 'oauth')
  const derivedPrimaryProvider = primaryProvider || session.provider || ''
  type AccountType = 'anonymous' | 'nostr' | 'oauth'
  const accountType: AccountType =
    derivedPrimaryProvider === 'anonymous'
      ? 'anonymous'
      : derivedProfileSource === 'nostr'
        ? 'nostr'
        : 'oauth'
  const requiresNostrExtension = accountType === 'nostr'
  const canEditBasic = accountType === 'oauth' // OAuth-first accounts can edit basic profile

  const handleBasicSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEditBasic) return

    startTransition(async () => {
      try {
        const result = await updateBasicProfile(basicProfile)
        
        if (result.success) {
          await broadcastProfileRefresh()
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

    startTransition(async () => {
      try {
        const result = await updateEnhancedProfile(enhancedProfile)
        
        if (result.success) {
          await broadcastProfileRefresh()
          setMessage({ 
            type: result.isNostrFirst ? 'info' : 'success', 
            text: result.message 
          })
          setTimeout(() => setMessage(null), 7000)
        } else {
          setMessage({ type: 'error', text: result.message })
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to update enhanced profile' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground">
            Update your profile information and preferences
          </p>
        </div>
        {onClose && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        )}
      </div>

      {/* Status Message */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'error' && <AlertTriangle className="h-4 w-4" />}
          {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
          {message.type === 'info' && <Info className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Account Type Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Info className="mr-2 h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Your account type determines which fields you can edit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Badge variant={accountType === 'oauth' ? "secondary" : "default"}>
              {accountType === 'anonymous'
                ? '🟢 Anonymous Account'
                : accountType === 'nostr'
                  ? '🔵 Nostr-First Account'
                  : '🟠 OAuth-First Account'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {accountType === 'anonymous'
                ? 'Temporary anon identity managed by the platform'
                : accountType === 'nostr'
                  ? 'Profile managed via Nostr relays'
                  : 'Profile managed by platform'}
            </span>
          </div>
          
          {requiresNostrExtension && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your main profile information comes from your Nostr profile. Changes to name, bio, and avatar 
                should be made using your Nostr client. You can update enhanced fields below.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Profile Form - OAuth-first accounts only */}
        {canEditBasic && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Profile</CardTitle>
              <CardDescription>
                Update your basic profile information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBasicSubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={basicProfile.name}
                    onChange={(e) => {
                      if (!basicProfileDirtyRef.current) {
                        setBasicProfileDirty(true)
                      }
                      setBasicProfile({ ...basicProfile, name: e.target.value })
                    }}
                    placeholder="Enter your name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={basicProfile.email}
                    onChange={(e) => {
                      if (!basicProfileDirtyRef.current) {
                        setBasicProfileDirty(true)
                      }
                      setBasicProfile({ ...basicProfile, email: e.target.value })
                    }}
                    placeholder="Enter your email"
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
                      Update Basic Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Profile Form - All accounts */}
        <Card>
          <CardHeader>
            <CardTitle>Enhanced Profile</CardTitle>
            <CardDescription>
              Update Nostr-related profile fields
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEnhancedSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="nip05">NIP-05 Address</Label>
                <Input
                  id="nip05"
                  value={enhancedProfile.nip05 as string}
                  onChange={(e) => setEnhancedProfile({ ...enhancedProfile, nip05: e.target.value })}
                  placeholder="user@domain.com"
                />
                <p className="text-sm text-muted-foreground">
                  Your Nostr address for verification
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lud16">Lightning Address</Label>
                <Input
                  id="lud16"
                  value={enhancedProfile.lud16 as string}
                  onChange={(e) => setEnhancedProfile({ ...enhancedProfile, lud16: e.target.value })}
                  placeholder="user@wallet.com"
                />
                <p className="text-sm text-muted-foreground">
                  Your Lightning address for payments
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="banner">Banner Image URL</Label>
                <Input
                  id="banner"
                  value={enhancedProfile.banner as string}
                  onChange={(e) => setEnhancedProfile({ ...enhancedProfile, banner: e.target.value })}
                  placeholder="https://example.com/banner.jpg"
                />
                <p className="text-sm text-muted-foreground">
                  URL to your profile banner image
                </p>
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

              {requiresNostrExtension && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    These fields may be overridden by your Nostr profile during the next sync.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Nostr Profile Management */}
      {requiresNostrExtension && (
        <Card>
          <CardHeader>
            <CardTitle>Nostr Profile Management</CardTitle>
            <CardDescription>
              How to manage your Nostr-first account profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <h4 className="font-medium">Profile Source</h4>
              <p className="text-sm text-muted-foreground">
                Your profile information comes from your Nostr profile (NIP-01 kind 0 events) and syncs automatically when you sign in.
              </p>
            </div>
            <div>
              <h4 className="font-medium">How to Update</h4>
              <p className="text-sm text-muted-foreground">
                Use your preferred Nostr client to update your profile information, then sign out and sign in again to sync changes.
              </p>
            </div>
            <div>
              <h4 className="font-medium">Enhanced Fields</h4>
              <p className="text-sm text-muted-foreground">
                The fields above (NIP-05, Lightning address, banner) can be set here but may be overridden by your Nostr profile if they exist there.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
