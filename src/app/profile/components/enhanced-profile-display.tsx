'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Session } from 'next-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { 
  User, 
  Mail, 
  Key, 
  Globe, 
  Github, 
  Twitter,
  ExternalLink,
  Info,
  AlertTriangle,
  Edit,
  Copy,
  Check,
  Zap,
  Shield,
  Eye,
  EyeOff,
  Link2
} from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ProfileEditForms } from './profile-edit-forms'
import type { AggregatedProfile } from '@/lib/profile-aggregator'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { getAccountType } from '@/lib/profile-priority'
import { ProfileOverviewSkeleton } from '@/app/profile/components/profile-skeletons'

interface EnhancedProfileDisplayProps {
  session: Session
}

// Provider badge colors and labels
const providerConfig = {
  nostr: { label: 'Nostr', color: 'bg-blue-500', icon: Key },
  github: { label: 'GitHub', color: 'bg-gray-800', icon: Github },
  email: { label: 'Email', color: 'bg-green-500', icon: Mail },
  profile: { label: 'Profile', color: 'bg-purple-500', icon: User },
  current: { label: 'Current', color: 'bg-orange-500', icon: User }
}

const heroFieldDescriptions: Record<string, string> = {
  Name: 'Public-facing name pulled from whichever provider currently has priority.',
  Email: 'Email used for login and notifications. It is never exposed to other users.',
  Username: 'Handle displayed whenever it differs from your display name.',
  Location: 'City or region synced from your linked providers.',
  Company: 'Organization or employer shared via your linked accounts.',
  'Public Key': 'Nostr public key that uniquely identifies you on relays.',
  'NIP-05': 'Domain-verified identifier mapping to your public key.',
  'Lightning Address': 'Destination for Lightning tips or payments.'
}

const extendedFieldDescriptions: Record<string, string> = {
  About: 'Long-form bio aggregated from your linked providers.',
  Website: 'Primary website or portfolio link that you have shared.',
  GitHub: 'GitHub handle pulled directly from your linked GitHub account.',
  Twitter: 'Twitter/X handle synced from your linked accounts.'
}

const accountDetailDescriptions: Record<string, string> = {
  'Primary Provider': 'The login method treated as your main authentication path.',
  'Profile Source': 'Determines which provider wins when multiple sources provide the same field.',
  'Account Type': 'Indicates whether Nostr or OAuth data is authoritative.',
  'Key Custody': 'Shows who currently controls the private keys for signing.',
  'Can Sign Events': 'Tells you if this session can sign Nostr events locally.',
  'Total Linked Accounts': 'Number of providers linked to this profile.'
}

function ProviderBadge({ source }: { source: string }) {
  const config = providerConfig[source as keyof typeof providerConfig] || {
    label: source,
    color: 'bg-gray-500',
    icon: Link2
  }

  const Icon = config.icon
  
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export function EnhancedProfileDisplay({ session }: EnhancedProfileDisplayProps) {
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [aggregatedProfile, setAggregatedProfile] = useState<AggregatedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { user } = session

  // Fetch aggregated profile data
  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/profile/aggregated')
      if (!response.ok) {
        let message = 'Failed to load profile'
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch {}
        throw new Error(message)
      }
      const data = await response.json()
      setAggregatedProfile(data)
    } catch (error) {
      console.error('Failed to fetch aggregated profile:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to fetch aggregated profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const canSignEvents = !!user.privkey

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

  /**
   * Normalize and validate an external website URL.
   * Ensures the URL uses http/https and returns a fully-qualified URL string.
   * Returns null when the value is invalid or unsafe.
   */
  function normalizeExternalUrl(raw: string): string | null {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) return null
    try {
      const direct = new URL(value)
      if (direct.protocol === 'http:' || direct.protocol === 'https:') return direct.toString()
      return null
    } catch {}
    try {
      const withHttps = new URL(`https://${value}`)
      if (withHttps.protocol === 'http:' || withHttps.protocol === 'https:') return withHttps.toString()
      return null
    } catch {
      return null
    }
  }

  if (loading) {
    return <ProfileOverviewSkeleton />
  }

  const profile = aggregatedProfile || {
    name: user.name ? { value: user.name, source: 'current' } : undefined,
    email: user.email ? { value: user.email, source: 'current' } : undefined,
    username: user.username ? { value: user.username, source: 'current' } : undefined,
    image: user.image ? { value: user.image, source: 'current' } : undefined,
    linkedAccounts: [],
    primaryProvider: null,
    profileSource: null,
    totalLinkedAccounts: 0
  }
  const accountType = getAccountType(profile.primaryProvider, profile.profileSource)
  const accountBadgeLabel =
    accountType === 'anonymous'
      ? '🟢 Anonymous Account'
      : accountType === 'nostr'
        ? '🔵 Nostr-First Account'
        : '🟠 OAuth-First Account'
  const accountBadgeVariant = accountType === 'oauth' ? 'secondary' : 'default'

  if (showEditForm) {
    return (
      <ProfileEditForms
        session={session}
        onClose={() => setShowEditForm(false)}
        profileSource={(profile.profileSource as 'nostr' | 'oauth' | null) ?? null}
        primaryProvider={profile.primaryProvider ?? null}
      />
    )
  }

  const websiteHref = profile.website ? normalizeExternalUrl(profile.website.value) : null
  const bannerImage = profile.banner?.value || user.banner || null

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
    copyKey?: string,
    copyValue?: string,
    badgeSource?: string
  ) => {
    if (!value) return null
    const valueToCopy = copyValue ?? value
    const tooltip = heroFieldDescriptions[label]
    const tooltipTone = bannerImage ? 'text-white/70 hover:text-white' : undefined

    return (
      <div className={cn('flex items-center justify-between rounded-2xl border px-4 py-3', heroFieldClasses)}>
        <div className="space-y-1 pr-3">
          <p className={cn('text-xs uppercase tracking-wide', heroLabelClasses)}>
            <span className="flex items-center gap-1">
              {label}
              {tooltip && (
                <InfoTooltip
                  content={tooltip}
                  className={tooltipTone}
                  iconClassName="h-3.5 w-3.5"
                />
              )}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium break-all">{value}</p>
            {badgeSource && <ProviderBadge source={badgeSource} />}
          </div>
        </div>
        {copyKey && (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 w-8 rounded-full', heroCopyButtonClasses)}
            onClick={() => copyToClipboard(valueToCopy, copyKey)}
            aria-label={copiedField === copyKey ? `Copied ${label}` : `Copy ${label}`}
          >
            {copiedField === copyKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    )
  }

  const renderAccountDetailRow = (label: string, value: ReactNode) => (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1 font-medium">
        <span>{label}</span>
        {accountDetailDescriptions[label] && (
          <InfoTooltip content={accountDetailDescriptions[label]} />
        )}
      </div>
      <span className="text-muted-foreground text-right">{value}</span>
    </div>
  )

  const usernameValue = profile.username?.value
  const nameValue = profile.name?.value
  const shouldRenderUsernameField =
    Boolean(usernameValue) && (!nameValue || usernameValue !== nameValue)
  const shouldShowHeroDetails = Boolean(
    profile.name ||
    profile.email ||
    shouldRenderUsernameField ||
    profile.location ||
    profile.company ||
    profile.pubkey ||
    profile.nip05 ||
    profile.lud16
  )

  return (
    <div className="space-y-6">
      {/* Error State */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to load profile</AlertTitle>
          <AlertDescription>
            {errorMessage}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={fetchProfile} disabled={loading}>
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
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
                <AvatarImage 
                  src={profile.image?.value || user.image || undefined} 
                  alt={profile.name?.value || user.name || 'User'} 
                />
                <AvatarFallback>
                  {(profile.name?.value || user.name || user.username || 'U').substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl sm:text-2xl">
                    {profile.name?.value || user.name || user.username || 'Unknown User'}
                  </CardTitle>
                  {profile.name && <ProviderBadge source={profile.name.source} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={accountBadgeVariant}>
                    {accountBadgeLabel}
                  </Badge>
                  {canSignEvents && (
                    <Badge variant="outline" className="bg-background/40 backdrop-blur">
                      <Zap className="mr-1 h-3 w-3" />
                      Can Sign Events
                    </Badge>
                  )}
                  {profile.totalLinkedAccounts > 0 && (
                    <Badge variant="outline" className="bg-background/40 backdrop-blur">
                      <Link2 className="mr-1 h-3 w-3" />
                      {profile.totalLinkedAccounts} Linked
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

          {shouldShowHeroDetails && (
            <div className="mt-6 w-full space-y-3 px-6 pb-6">
              <Separator className={bannerImage ? 'border-white/30' : ''} />
              <div className={cn('rounded-2xl border px-4 py-4', heroPanelClasses)}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {renderHeroField('Name', profile.name?.value, 'name', profile.name?.value, profile.name?.source)}
                  {renderHeroField('Email', profile.email?.value, 'email', profile.email?.value, profile.email?.source)}
                  {shouldRenderUsernameField &&
                    profile.username &&
                    renderHeroField('Username', usernameValue, 'username', usernameValue, profile.username.source)}
                  {renderHeroField('Location', profile.location?.value, undefined, undefined, profile.location?.source)}
                  {renderHeroField('Company', profile.company?.value, undefined, undefined, profile.company?.source)}
                  {renderHeroField('Public Key', profile.pubkey ? formatKey(profile.pubkey.value) : undefined, 'pubkey', profile.pubkey?.value, profile.pubkey?.source)}
                  {renderHeroField('NIP-05', profile.nip05?.value, 'nip05', profile.nip05?.value, profile.nip05?.source)}
                  {renderHeroField('Lightning Address', profile.lud16?.value, 'lud16', profile.lud16?.value, profile.lud16?.source)}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {user.privkey && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="mr-2 h-5 w-5" />
              Private Key
              <InfoTooltip content="Only visible to you. Never share this value with anyone." />
            </CardTitle>
            <CardDescription>
              Toggle visibility to copy your locally stored key
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">Key</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  aria-label={showPrivateKey ? "Hide private key" : "Show private key"}
                  title={showPrivateKey ? "Hide private key" : "Show private key"}
                >
                  {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {user.privkey ? (
                <div className="flex items-center justify-between">
                  <code className="text-sm text-muted-foreground font-mono break-all">
                    {showPrivateKey ? user.privkey : formatKey(user.privkey)}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(user.privkey!, 'privkey')}
                    aria-label="Copy private key"
                  >
                    {copiedField === 'privkey' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No private key available</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extended Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="mr-2 h-5 w-5" />
            Extended Profile
            <InfoTooltip content="Fields pulled from every linked provider so you can see them in one place." />
          </CardTitle>
          <CardDescription>
            Combined information from all your linked accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* About/Bio */}
            {profile.about && (
              <div className="sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-medium">About</h4>
                  {extendedFieldDescriptions.About && (
                    <InfoTooltip content={extendedFieldDescriptions.About} />
                  )}
                  <ProviderBadge source={profile.about.source} />
                </div>
                <p className="text-muted-foreground">
                  {profile.about.value}
                </p>
              </div>
            )}

            {/* Website */}
            {profile.website && (
              <div>
                <div className="flex items-center gap-2 mb-1 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  <span>Website</span>
                  {extendedFieldDescriptions.Website && (
                    <InfoTooltip content={extendedFieldDescriptions.Website} />
                  )}
                  <ProviderBadge source={profile.website.source} />
                </div>
                {websiteHref ? (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center"
                  >
                    {profile.website.value}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{profile.website.value || 'Invalid URL'}</span>
                )}
              </div>
            )}

            {/* GitHub */}
            {profile.github && (
              <div>
                <div className="flex items-center gap-2 mb-1 text-sm font-medium">
                  <Github className="h-4 w-4" />
                  <span>GitHub</span>
                  {extendedFieldDescriptions.GitHub && (
                    <InfoTooltip content={extendedFieldDescriptions.GitHub} />
                  )}
                  <ProviderBadge source={profile.github.source} />
                </div>
                <a 
                  href={`https://github.com/${profile.github.value}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center"
                >
                  @{profile.github.value}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </div>
            )}

            {/* Twitter */}
            {profile.twitter && (
              <div>
                <div className="flex items-center gap-2 mb-1 text-sm font-medium">
                  <Twitter className="h-4 w-4" />
                  <span>Twitter</span>
                  {extendedFieldDescriptions.Twitter && (
                    <InfoTooltip content={extendedFieldDescriptions.Twitter} />
                  )}
                  <ProviderBadge source={profile.twitter.source} />
                </div>
                <a 
                  href={`https://twitter.com/${profile.twitter.value}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center"
                >
                  @{profile.twitter.value}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Linked Accounts Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Linked Accounts
            <InfoTooltip content="Every provider currently linked plus whether it is the primary source." />
          </CardTitle>
          <CardDescription>
            All accounts connected to your profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {profile.linkedAccounts.map((account) => (
              <div key={`${account.provider}-${account.providerAccountId}`} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${providerConfig[account.provider as keyof typeof providerConfig]?.color || 'bg-gray-500'} bg-opacity-10`}>
                    {(() => {
                      const Icon = providerConfig[account.provider as keyof typeof providerConfig]?.icon || Link2
                      return <Icon className="h-4 w-4" />
                    })()}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {providerConfig[account.provider as keyof typeof providerConfig]?.label || account.provider}
                      {account.isPrimary && (
                        <Badge variant="secondary" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {account.data.name || account.data.email || account.providerAccountId.substring(0, 16) + '...'}
                    </div>
                  </div>
                </div>
                <Badge variant={account.isConnected ? "default" : "secondary"}>
                  {account.isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Account Configuration
            <InfoTooltip content="Summaries that explain how your authentication providers influence the profile you see here." />
          </CardTitle>
          <CardDescription>
            Details about your account type and capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {renderAccountDetailRow(
              'Primary Provider',
              profile.primaryProvider
                ? providerConfig[profile.primaryProvider as keyof typeof providerConfig]?.label || profile.primaryProvider
                : 'Not set'
            )}
            {renderAccountDetailRow(
              'Profile Source',
              profile.profileSource === 'nostr'
                ? 'Nostr (Decentralized)'
                : profile.profileSource === 'oauth'
                ? 'OAuth Provider'
                : 'Default'
            )}
            {renderAccountDetailRow(
              'Account Type',
              accountBadgeLabel
            )}
            {renderAccountDetailRow(
              'Key Custody',
              !user.privkey ? 'User Controlled (NIP07)' : 'Platform Managed'
            )}
            {renderAccountDetailRow(
              'Can Sign Events',
              canSignEvents ? 'Yes' : 'No (External signing required)'
            )}
            {renderAccountDetailRow(
              'Total Linked Accounts',
              profile.totalLinkedAccounts
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
