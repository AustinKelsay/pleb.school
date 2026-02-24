import { afterEach, describe, expect, it, vi } from "vitest"

const originalGithubClientId = process.env.GITHUB_CLIENT_ID
const originalGithubClientSecret = process.env.GITHUB_CLIENT_SECRET
const originalNodeEnv = process.env.NODE_ENV
const mutableEnv = process.env as Record<string, string | undefined>

const RATE_LIMIT_MODULE_PATH = new URL("../rate-limit.ts", import.meta.url).pathname
const PRISMA_MODULE_PATH = new URL("../prisma.ts", import.meta.url).pathname

function restoreEnv() {
  if (originalGithubClientId === undefined) {
    delete process.env.GITHUB_CLIENT_ID
  } else {
    process.env.GITHUB_CLIENT_ID = originalGithubClientId
  }

  if (originalGithubClientSecret === undefined) {
    delete process.env.GITHUB_CLIENT_SECRET
  } else {
    process.env.GITHUB_CLIENT_SECRET = originalGithubClientSecret
  }

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv
  }
}

type RateLimitResult = {
  success: boolean
  remaining: number
  resetIn: number
}

async function loadAuthModuleForAnonymousTests(params?: {
  cookieToken?: string
  rateLimitResults?: RateLimitResult[]
  matchedUser?: { id: string; email: string | null; username: string | null; avatar: string | null; pubkey: string | null } | null
  createdUser?: { id: string; email: string | null; username: string | null; avatar: string | null; pubkey: string | null }
}) {
  vi.resetModules()

  process.env.GITHUB_CLIENT_ID = "test-github-client-id"
  process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret"
  mutableEnv.NODE_ENV = "test"

  const rateLimitQueue = [...(params?.rateLimitResults ?? [{ success: true, remaining: 1, resetIn: 60 }])]
  const checkRateLimit = vi.fn().mockImplementation(async () => {
    return rateLimitQueue.shift() ?? { success: true, remaining: 1, resetIn: 60 }
  })

  const getClientIp = vi.fn().mockResolvedValue("127.0.0.1")
  const hashToken = vi.fn().mockReturnValue("hashed-reconnect-token")
  const generateReconnectToken = vi.fn().mockReturnValue({
    token: "rotated-token",
    tokenHash: "rotated-token-hash",
  })

  const findUnique = vi.fn().mockResolvedValue(params?.matchedUser ?? null)
  const update = vi.fn().mockResolvedValue({})
  const create = vi.fn().mockResolvedValue(
    params?.createdUser ?? {
      id: "new-user",
      email: null,
      username: "anon_12345678",
      avatar: null,
      pubkey: "a".repeat(64),
    }
  )

  const cookiesGet = vi.fn().mockImplementation((name: string) => {
    if (name !== "anon-reconnect-token" || !params?.cookieToken) {
      return undefined
    }
    return { value: params.cookieToken }
  })
  const cookiesFn = vi.fn().mockResolvedValue({
    get: cookiesGet,
  })

  const generateKeypair = vi.fn().mockResolvedValue({
    publicKey: "a".repeat(64),
    privateKey: "b".repeat(64),
  })

  const syncUserProfileFromNostr = vi.fn().mockResolvedValue(null)

  vi.doMock("@auth/prisma-adapter", () => ({
    PrismaAdapter: vi.fn(() => ({})),
  }))
  vi.doMock("next-auth/providers/email", () => ({
    default: (config: Record<string, unknown>) => ({
      id: "email",
      type: "email",
      ...config,
    }),
  }))
  vi.doMock("next-auth/providers/credentials", () => ({
    default: (config: Record<string, unknown>) => ({
      type: "credentials",
      ...config,
    }),
  }))
  vi.doMock("next-auth/providers/github", () => ({
    default: (config: Record<string, unknown>) => ({
      id: "github",
      type: "oauth",
      ...config,
    }),
  }))
  vi.doMock("../email-config", () => ({
    resolveEmailRuntimeConfig: vi.fn().mockReturnValue(null),
  }))
  vi.doMock("../rate-limit", () => ({
    checkRateLimit,
    RATE_LIMITS: {
      AUTH_MAGIC_LINK: { limit: 3, windowSeconds: 3600 },
      AUTH_NOSTR: { limit: 3, windowSeconds: 3600 },
      AUTH_ANONYMOUS_PER_IP: { limit: 5, windowSeconds: 3600 },
      AUTH_ANONYMOUS_GLOBAL: { limit: 50, windowSeconds: 3600 },
    },
    getClientIp,
  }))
  vi.doMock(RATE_LIMIT_MODULE_PATH, () => ({
    checkRateLimit,
    RATE_LIMITS: {
      AUTH_MAGIC_LINK: { limit: 3, windowSeconds: 3600 },
      AUTH_NOSTR: { limit: 3, windowSeconds: 3600 },
      AUTH_ANONYMOUS_PER_IP: { limit: 5, windowSeconds: 3600 },
      AUTH_ANONYMOUS_GLOBAL: { limit: 50, windowSeconds: 3600 },
    },
    getClientIp,
  }))
  vi.doMock("../prisma", () => ({
    prisma: {
      user: {
        findUnique,
        update,
        create,
      },
    },
  }))
  vi.doMock(PRISMA_MODULE_PATH, () => ({
    prisma: {
      user: {
        findUnique,
        update,
        create,
      },
    },
  }))
  vi.doMock("next/headers", () => ({
    cookies: cookiesFn,
  }))
  vi.doMock("snstr", () => ({
    generateKeypair,
    decodePrivateKey: vi.fn(),
    getPublicKey: vi.fn(),
    verifySignature: vi.fn().mockReturnValue(true),
    getEventHash: vi.fn().mockReturnValue("event-hash"),
  }))
  vi.doMock("../privkey-crypto", () => ({
    encryptPrivkey: vi.fn().mockReturnValue("encrypted-privkey"),
    decryptPrivkey: vi.fn(),
  }))
  vi.doMock("../nostr-profile", () => ({
    fetchNostrProfile: vi.fn().mockResolvedValue(null),
    syncUserProfileFromNostr,
  }))
  vi.doMock("../anon-reconnect-token", () => ({
    generateReconnectToken,
    hashToken,
  }))
  vi.doMock("../logger", () => ({
    default: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }))

  const authModule = await import("../auth")
  const anonymousProvider = (authModule.authOptions.providers as Array<any>).find(
    (provider) => provider?.id === "anonymous"
  )

  return {
    anonymousProvider,
    mocks: {
      checkRateLimit,
      cookiesFn,
      cookiesGet,
      hashToken,
      generateReconnectToken,
      findUnique,
      update,
      create,
      generateKeypair,
      syncUserProfileFromNostr,
    },
  }
}

describe("auth anonymous reconnect-cookie authorize flow", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    restoreEnv()
  })

  it("authenticates with a valid reconnect cookie token and rotates it", async () => {
    const { anonymousProvider, mocks } = await loadAuthModuleForAnonymousTests({
      cookieToken: "valid-cookie-token",
      matchedUser: {
        id: "user-1",
        email: null,
        username: "anon_user_1",
        avatar: null,
        pubkey: "c".repeat(64),
      },
    })

    const result = await anonymousProvider.authorize({})

    expect(result).toMatchObject({
      id: "user-1",
      reconnectToken: "rotated-token",
    })
    expect(mocks.hashToken).toHaveBeenCalledWith("valid-cookie-token")
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { anonReconnectTokenHash: "hashed-reconnect-token" },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        pubkey: true,
      },
    })
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { anonReconnectTokenHash: "rotated-token-hash" },
    })
  })

  it("falls back to new anonymous account creation when reconnect cookie is missing", async () => {
    const { anonymousProvider, mocks } = await loadAuthModuleForAnonymousTests({
      cookieToken: undefined,
      rateLimitResults: [
        { success: true, remaining: 4, resetIn: 60 },
        { success: true, remaining: 49, resetIn: 60 },
      ],
      createdUser: {
        id: "user-new",
        email: null,
        username: "anon_user_new",
        avatar: null,
        pubkey: "a".repeat(64),
      },
    })

    const result = await anonymousProvider.authorize({})

    expect(result).toMatchObject({
      id: "user-new",
      reconnectToken: "rotated-token",
    })
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.generateKeypair).toHaveBeenCalled()
    expect(mocks.create).toHaveBeenCalled()
    expect(mocks.syncUserProfileFromNostr).toHaveBeenCalledWith("user-new", "a".repeat(64))
  })

  it("returns null when reconnect-token rate limiting fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { anonymousProvider, mocks } = await loadAuthModuleForAnonymousTests({
      cookieToken: "valid-cookie-token",
      rateLimitResults: [{ success: false, remaining: 0, resetIn: 60 }],
    })

    const result = await anonymousProvider.authorize({})

    expect(result).toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      "Anonymous authentication error:",
      expect.any(Error)
    )
  })
})
