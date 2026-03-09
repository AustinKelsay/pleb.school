"use client"

import Link from "next/link"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { AlertCircle, Cable, Loader2, RadioTower, Send, Settings2, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  useCommunityMessageMutation,
  useCommunityMembershipMutation,
  useCommunityRoomQuery,
  useCommunitySpaceQuery,
} from "@/hooks/useCommunity"
import { useIsAdmin } from "@/hooks/useAdmin"
import { useSession } from "@/hooks/useSession"
import { useToast } from "@/hooks/use-toast"
import { copyConfig } from "@/lib/copy"
import { getCommunitySetupState } from "@/lib/community/config"
import { cn } from "@/lib/utils"
import type { CommunitySetupState } from "@/lib/community/types"

const communityCopy = copyConfig.feeds?.community ?? {
  emptyMessages: "No messages yet. Start the conversation!",
  composePlaceholder: "Share a message...",
  composePlaceholderDisabled: "Join the community to send messages.",
  errorTitle: "Could not connect",
  errorDescription: "Unable to reach the community. Please try again later.",
}

function formatPubkey(pubkey: string) {
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-6)}`
}

function formatRelativeTime(unixSeconds: number) {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return "An unknown community error occurred."
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : undefined
  }

  return undefined
}

const codeClassName = "rounded bg-muted px-1 py-0.5 text-xs font-mono"

function renderInlineCode(text: string): ReactNode {
  const parts = text.split(/`([^`]+)`/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <code key={i} className={codeClassName}>{part}</code> : part
  )
}

function SetupChecklist({
  setupState,
}: {
  setupState: CommunitySetupState
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-background/80 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Admin setup checklist</h3>
      </div>
      <ol className="space-y-2 text-sm text-muted-foreground">
        {setupState.checklist.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <span>{renderInlineCode(item)}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="rounded-xl border bg-card/70 p-3">
          <div className="font-medium text-foreground">Config file</div>
          <div className="mt-1 font-mono">config/communities.json</div>
        </div>
        <div className="rounded-xl border bg-card/70 p-3">
          <div className="font-medium text-foreground">Current relay</div>
          <div className="mt-1 break-all font-mono">{setupState.relayUrl}</div>
        </div>
        <div className="rounded-xl border bg-card/70 p-3">
          <div className="font-medium text-foreground">Management URL</div>
          <div className="mt-1 break-all font-mono">{setupState.managementUrl ?? "Not set"}</div>
        </div>
        <div className="rounded-xl border bg-card/70 p-3">
          <div className="font-medium text-foreground">Primary group</div>
          <div className="mt-1 break-all font-mono">{setupState.groupId}</div>
        </div>
      </div>
    </div>
  )
}

function CommunityNotReadyState({
  isAdmin,
  setupState,
  mode,
  errorMessage,
}: {
  isAdmin: boolean
  setupState: CommunitySetupState
  mode: "setup" | "unavailable"
  errorMessage?: string
}) {
  const isSetupMode = mode === "setup"

  return (
    <div className="space-y-6 pt-6">
      <div className="relative overflow-hidden rounded-3xl border bg-card/70 p-8 shadow-sm sm:p-10">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/15 to-transparent" />
        <div className="relative space-y-8">
          <div className="space-y-4 text-center">
            <Badge className="mx-auto w-fit" variant="outline">
              {isSetupMode ? "Community setup" : "Community unavailable"}
            </Badge>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {isSetupMode
                  ? isAdmin
                    ? "Configure your community relay"
                    : "Community space coming soon"
                  : isAdmin
                    ? "Community relay needs attention"
                    : "Community is temporarily unavailable"}
              </h2>
              <p className="mx-auto max-w-3xl text-base text-muted-foreground sm:text-lg">
                {isSetupMode
                  ? isAdmin
                    ? "Point this space at your Zooid relay, set the NIP-29 group ids, and then enable the community space."
                    : "The community space hasn't been set up yet. Check back soon — once it's ready, you'll be able to join rooms and chat here."
                  : isAdmin
                    ? "The community relay is configured, but the app could not reach it. Verify the relay URL, Zooid process, and group configuration."
                    : "The community space is temporarily offline. Please check back later."}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border/70 bg-background/70 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2.5">
                      <RadioTower className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Relay-backed space</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Connect a Zooid or Flotilla-compatible relay over WebSocket for room and membership state.
                      </div>
                    </div>
                  </div>
                </Card>
                <Card className="border-border/70 bg-background/70 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2.5">
                      <Cable className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Room wiring</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Configure the main <code className={codeClassName}>space.groupId</code> and any room-specific <code className={codeClassName}>groupId</code> values in <code className={codeClassName}>config/communities.json</code>.
                      </div>
                    </div>
                  </div>
                </Card>
                <Card className="border-border/70 bg-background/70 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2.5">
                      <Settings2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">Enable and restart</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Turn <code className={codeClassName}>space.enabled</code> on and restart the app once the relay and room config are in place.
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
              <SetupChecklist setupState={setupState} />
            </>
          ) : (
            <div className="flex justify-center">
              <Button asChild>
                <Link href="/content">Browse content</Link>
              </Button>
            </div>
          )}

          {!isSetupMode && errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{communityCopy.errorTitle}</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function CommunityFeed() {
  const { data: session } = useSession()
  const { isAdmin, isModerator } = useIsAdmin()
  const { toast } = useToast()
  const setupState = getCommunitySetupState()
  const communityQuery = useCommunitySpaceQuery()
  const membershipMutation = useCommunityMembershipMutation()
  const messageMutation = useCommunityMessageMutation()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState("")
  const roomQuery = useCommunityRoomQuery(selectedRoomId ?? undefined)

  useEffect(() => {
    if (!selectedRoomId && communityQuery.data?.rooms[0]?.id) {
      const defaultRoom =
        communityQuery.data.rooms.find((room) => room.isDefault) ??
        communityQuery.data.rooms[0]
      setSelectedRoomId(defaultRoom?.id ?? null)
    }
  }, [communityQuery.data, selectedRoomId])

  const selectedRoom = roomQuery.data?.room
  const selectedRoomMembership = roomQuery.data?.membership
  const spaceMembership = communityQuery.data?.membership
  const canJoin = Boolean(session?.user && !spaceMembership?.isMember)
  const canLeave = Boolean(session?.user && spaceMembership?.isMember)
  const canSendMessage = useMemo(() => {
    if (!session?.user || !selectedRoom) return false
    if (!selectedRoom.requiresMembership) return true
    return Boolean(selectedRoomMembership?.isMember || spaceMembership?.isMember)
  }, [selectedRoom, selectedRoomMembership?.isMember, session?.user, spaceMembership?.isMember])
  const canSeeAdminSetup = isAdmin || isModerator
  const communityErrorCode = getErrorCode(communityQuery.error)

  const handleMembershipAction = async (action: "join" | "leave") => {
    try {
      await membershipMutation.mutateAsync(action)
      toast({
        title: action === "join" ? "Join request sent" : "Leave request sent",
        description:
          action === "join"
            ? "The relay accepted your membership request."
            : "Your leave request was published.",
      })
    } catch (error) {
      toast({
        title: "Membership error",
        description: toErrorMessage(error),
        variant: "destructive",
      })
    }
  }

  const handleSendMessage = async () => {
    const trimmed = draftMessage.trim()
    if (!selectedRoomId || !trimmed) return

    try {
      await messageMutation.mutateAsync({
        roomId: selectedRoomId,
        content: trimmed,
      })
      setDraftMessage("")
      toast({ title: "Message sent" })
    } catch (error) {
      toast({
        title: "Message error",
        description: toErrorMessage(error),
        variant: "destructive",
      })
    }
  }

  const communityName =
    communityQuery.data?.state.metadata?.name ||
    communityQuery.data?.space.name ||
    "Community"
  const communityDescription =
    communityQuery.data?.state.metadata?.about || ""

  if (!setupState.isConfigured) {
    return (
      <CommunityNotReadyState
        isAdmin={canSeeAdminSetup}
        setupState={setupState}
        mode="setup"
      />
    )
  }

  if (communityQuery.error) {
    const shouldShowAdminSetupHelp = canSeeAdminSetup && (
      communityErrorCode === "relay_unreachable" ||
      communityErrorCode === "relay_timeout" ||
      communityErrorCode === "relay_error"
    )

    if (shouldShowAdminSetupHelp) {
      return (
        <CommunityNotReadyState
          isAdmin={canSeeAdminSetup}
          setupState={setupState}
          mode="unavailable"
          errorMessage={toErrorMessage(communityQuery.error)}
        />
      )
    }
  }

  return (
    <div className="space-y-6 pt-6">
      {/* Compact header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{communityName}</h2>
          {spaceMembership?.isMember ? (
            <Badge variant="secondary">Member</Badge>
          ) : !communityQuery.isLoading ? (
            <Badge variant="outline">Not joined</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {communityDescription && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {communityDescription}
            </span>
          )}
          {canJoin && (
            <Button
              size="sm"
              onClick={() => void handleMembershipAction("join")}
              disabled={membershipMutation.isPending}
            >
              {membershipMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Join
            </Button>
          )}
          {canLeave && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleMembershipAction("leave")}
              disabled={membershipMutation.isPending}
            >
              {membershipMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Leave
            </Button>
          )}
          {!session?.user && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/auth/signin">Sign in</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {communityQuery.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{communityCopy.errorTitle}</AlertTitle>
          <AlertDescription>{communityCopy.errorDescription}</AlertDescription>
        </Alert>
      )}

      {/* Loading state — centered spinner */}
      {communityQuery.isLoading && !communityQuery.data && (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading community...
          </div>
        </div>
      )}

      {/* Room sidebar + message panel */}
      {(!communityQuery.isLoading || communityQuery.data) && (
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Room sidebar — vertical on desktop, horizontal scroll on mobile */}
        <div>
          <div className="mb-3 text-sm font-medium text-muted-foreground">Rooms</div>

          {/* Mobile: horizontal scrollable pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {communityQuery.data?.rooms.map((room) => {
              const active = room.id === selectedRoomId
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={cn(
                    "flex-none rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {room.state.metadata?.name || room.name}
                  {room.isDefault && (
                    <span className="ml-1.5 text-xs opacity-60">Default</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Desktop: vertical card list */}
          <div className="hidden space-y-2 lg:block">
            {communityQuery.data?.rooms.map((room) => {
              const active = room.id === selectedRoomId
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {room.state.metadata?.name || room.name}
                    </span>
                    {room.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                  </div>
                  {(room.state.metadata?.about || room.description) && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {room.state.metadata?.about || room.description}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Message panel */}
        <Card className="flex flex-col">
          {/* Room name header */}
          {selectedRoom && (
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-medium">{selectedRoom.name}</h3>
            </div>
          )}

          {/* Loading / error for room */}
          {roomQuery.isLoading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages...
            </div>
          )}

          {roomQuery.error && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{communityCopy.errorTitle}</AlertTitle>
                <AlertDescription>{toErrorMessage(roomQuery.error)}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Messages area */}
          <div className="flex min-h-[400px] max-h-[60vh] flex-col gap-3 overflow-y-auto p-4">
            {roomQuery.data?.messages.length ? (
              roomQuery.data.messages.map((message) => (
                <div key={message.id} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatPubkey(message.pubkey)}</span>
                    <span>{formatRelativeTime(message.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                </div>
              ))
            ) : !roomQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {communityCopy.emptyMessages}
              </div>
            ) : null}
          </div>

          {/* Compose area */}
          <div className="border-t p-4">
            <Textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              placeholder={
                canSendMessage
                  ? communityCopy.composePlaceholder
                  : communityCopy.composePlaceholderDisabled
              }
              disabled={!canSendMessage || messageMutation.isPending}
              className="min-h-[72px]"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleSendMessage()}
                disabled={!canSendMessage || !draftMessage.trim() || messageMutation.isPending}
              >
                {messageMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3.5 w-3.5" />
                )}
                Send
              </Button>
            </div>
          </div>
        </Card>
      </div>
      )}
    </div>
  )
}
