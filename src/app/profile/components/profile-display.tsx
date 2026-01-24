'use client'

/**
 * Profile Display Component
 * 
 * Uses standard shadcn/ui components with minimal hardcoded styles.
 * Relies on configurable theme system for all styling.
 * 
 * Features:
 * - Theme-aware design using shadcn component variants
 * - Responsive layout using CSS Grid and Flexbox utilities
 * - Standard shadcn component patterns and spacing
 */

import { useState } from 'react'
import { Session } from 'next-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Key, 
  Globe, 
  MapPin, 
  Github, 
  Twitter,
  ExternalLink,
  Edit,
  Copy,
  Check,
  Zap,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  RotateCcw
} from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ProfileEditForms } from './profile-edit-forms'
import { cn } from '@/lib/utils'

interface ProfileDisplayProps {
  session: Session
}

export function ProfileDisplay({ session }: ProfileDisplayProps) {
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [fetchingKey, setFetchingKey] = useState(false)
  const [fetchKeyError, setFetchKeyError] = useState<string | null>(null)
  const { user } = session

  // Determine authentication method and capabilities
  const isNostrFirst = !user.hasEphemeralKeys
  const canSignEvents = !!user.hasEphemeralKeys
  const hasCompleteProfile = !!user.nostrProfile

  // Fetch recovery key from API when user wants to view it
  const fetchRecoveryKey = async () => {
    if (recoveryKey) return // Already fetched
    setFetchKeyError(null)
    setFetchingKey(true)
    try {
      const response = await fetch('/api/profile/recovery-key')
      if (response.ok) {
        const data = await response.json()
        setRecoveryKey(data.recoveryKey)
      } else {
        let message = 'Failed to fetch recovery key'
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch {}
        setFetchKeyError(message)
      }
    } catch (error) {
      console.error('Failed to fetch recovery key:', error)
      setFetchKeyError(error instanceof Error ? error.message : 'Failed to fetch recovery key')
    } finally {
      setFetchingKey(false)
    }
  }

  const handleShowPrivateKey = async () => {
    if (!showPrivateKey && !recoveryKey) {
      await fetchRecoveryKey()
    }
    setShowPrivateKey(!showPrivateKey)
  }

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const formatKey = (key: string) => {
    return `${key.substring(0, 8)}...${key.substring(56)}`
  }

  if (showEditForm) {
    return <ProfileEditForms session={session} onClose={() => setShowEditForm(false)} />
  }

  const bannerImage = user.banner || null
  const heroPanelClasses = bannerImage
    ? 'border-white/20 bg-black/50 text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur'
    : 'border-border bg-muted/60 text-foreground'
  const heroFieldClasses = bannerImage
    ? 'bg-white/5 text-white border-white/10'
    : 'bg-background/60 text-foreground border-border'
  const heroLabelClasses = bannerImage ? 'text-white/70' : 'text-muted-foreground'
  const heroCopyButtonClasses = bannerImage ? 'text-white hover:bg-white/20' : ''

  const renderHeroField = (
    label: string,
    value?: string | null,
    key?: string,
    copyValue?: string
  ) => {
    if (!value) return null
    return (
      <div className={cn('flex items-center justify-between rounded-2xl border px-4 py-3', heroFieldClasses)}>
        <div className="space-y-1 pr-3">
          <p className={cn('text-xs uppercase tracking-wide', heroLabelClasses)}>{label}</p>
          <p className="text-sm font-medium break-all">{value}</p>
        </div>
        {key && (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 w-8 rounded-full', heroCopyButtonClasses)}
            onClick={() => copyToClipboard(copyValue ?? value, key)}
            aria-label={copiedField === key ? `${label} copied` : `Copy ${label} to clipboard`}
            title={copiedField === key ? `${label} copied` : `Copy ${label} to clipboard`}
          >
            {copiedField === key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Hero */}
      <Card className="border-none bg-transparent shadow-none">
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 min-h-[220px] sm:min-h-[260px]">
          {bannerImage && (
            <>
              <OptimizedImage
                src={bannerImage}
                alt="Profile banner artwork"
                width={1600}
                height={400}
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                priority={false}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/30 to-background/90" />
            </>
          )}
          <div
            className={cn(
              'relative flex flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between',
              bannerImage ? 'text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.55)]' : ''
            )}
          >
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-2 ring-white/60">
                <AvatarImage src={user.image || undefined} alt={user.name || 'User'} />
                <AvatarFallback>
                  {(user.name || user.username || 'U').substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <CardTitle className="text-xl sm:text-2xl">
                  {user.name || user.username || 'Unknown User'}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={isNostrFirst ? "default" : "secondary"}>
                    {isNostrFirst ? '🔵 Nostr-First' : '🟠 OAuth-First'}
                  </Badge>
                  {canSignEvents && (
                    <Badge variant="outline" className="bg-background/40 backdrop-blur">
                      <Zap className="mr-1 h-3 w-3" />
                      Can Sign Events
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant={bannerImage ? 'secondary' : 'outline'}
              className={bannerImage ? 'bg-white/90 text-black hover:bg-white' : ''}
              onClick={() => setShowEditForm(true)}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>
          </div>

          {(user.name ||
            user.email ||
            (user.username && user.username !== user.name) ||
            user.pubkey ||
            user.nip05 ||
            user.lud16) && (
            <div className="mt-6 w-full space-y-3 px-6 pb-6">
              <Separator className={bannerImage ? 'border-white/30' : ''} />
              <div className={cn('rounded-2xl border px-4 py-4', heroPanelClasses)}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {renderHeroField('Name', user.name, 'name')}
                {renderHeroField('Email', user.email, 'email')}
                {user.username && user.username !== user.name && renderHeroField('Username', user.username, 'username')}
                {renderHeroField('Public Key', user.pubkey ? formatKey(user.pubkey) : undefined, 'pubkey', user.pubkey)}
                {renderHeroField('NIP-05', user.nip05, 'nip05')}
                {renderHeroField('Lightning Address', user.lud16, 'lud16')}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {user.hasEphemeralKeys && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Key className="mr-2 h-5 w-5" />
              Private Key
            </CardTitle>
            <CardDescription>
              Toggle visibility to copy your recovery key
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Key</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShowPrivateKey}
                  disabled={fetchingKey}
                  aria-label={showPrivateKey ? 'Hide private key' : 'Show private key'}
                  title={showPrivateKey ? 'Hide private key' : 'Show private key'}
                >
                  {fetchingKey ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : showPrivateKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {showPrivateKey && (
                <>
                  {fetchKeyError ? (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <div className="flex items-center justify-between">
                        <AlertDescription>{fetchKeyError}</AlertDescription>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchRecoveryKey}
                          disabled={fetchingKey}
                          className="ml-4"
                        >
                          <RotateCcw className="mr-2 h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    </Alert>
                  ) : recoveryKey ? (
                    <div className="flex items-center justify-between">
                      <code className="text-sm text-muted-foreground font-mono break-all">
                        {recoveryKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(recoveryKey, 'privkey')}
                        aria-label={copiedField === 'privkey' ? 'Private key copied' : 'Copy private key to clipboard'}
                        title={copiedField === 'privkey' ? 'Private key copied' : 'Copy private key to clipboard'}
                      >
                        {copiedField === 'privkey' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Nostr Profile */}
      {hasCompleteProfile && user.nostrProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Globe className="mr-2 h-5 w-5" />
              Complete Nostr Profile
            </CardTitle>
            <CardDescription>
              All profile information from your Nostr identity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* About/Bio */}
              {!!user.nostrProfile.about && (
                <div className="sm:col-span-2">
                  <h4 className="mb-2 font-medium">About</h4>
                  <p className="text-muted-foreground">
                    {String(user.nostrProfile.about)}
                  </p>
                </div>
              )}

              {/* Website */}
              {!!user.nostrProfile.website && (
                <div className="flex items-center space-x-2">
                  <Globe className="h-4 w-4" />
                  <a 
                    href={String(user.nostrProfile.website)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center"
                  >
                    {String(user.nostrProfile.website)}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Location */}
              {!!user.nostrProfile.location && (
                <div className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4" />
                  <span className="text-muted-foreground">{String(user.nostrProfile.location)}</span>
                </div>
              )}

              {/* GitHub */}
              {!!user.nostrProfile.github && (
                <div className="flex items-center space-x-2">
                  <Github className="h-4 w-4" />
                  <a 
                    href={`https://github.com/${user.nostrProfile.github}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center"
                  >
                    @{String(user.nostrProfile.github)}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Twitter */}
              {!!user.nostrProfile.twitter && (
                <div className="flex items-center space-x-2">
                  <Twitter className="h-4 w-4" />
                  <a 
                    href={`https://twitter.com/${user.nostrProfile.twitter}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center"
                  >
                    @{String(user.nostrProfile.twitter)}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Additional Fields */}
            <Separator className="my-6" />
            <div className="space-y-2">
              <h4 className="font-medium">Additional Profile Fields</h4>
              <div className="grid gap-2">
                {Object.entries(user.nostrProfile)
                  .filter(([key]) => !['name', 'picture', 'about', 'website', 'location', 'github', 'twitter', 'nip05', 'lud16', 'banner'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="text-muted-foreground truncate max-w-xs">
                        {String(value)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Details about your account type and capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="flex justify-between">
              <span className="font-medium">Account Type:</span>
              <span className="text-muted-foreground">
                {isNostrFirst ? 'Nostr-First Account' : 'OAuth-First Account'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Key Custody:</span>
              <span className="text-muted-foreground">
                {isNostrFirst ? 'User Controlled (NIP07)' : 'Platform Managed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Can Sign Events:</span>
              <span className="text-muted-foreground">
                {canSignEvents ? 'Yes' : 'No (External signing required)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Complete Profile:</span>
              <span className="text-muted-foreground">
                {hasCompleteProfile ? 'Available from Nostr' : 'Basic fields only'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
