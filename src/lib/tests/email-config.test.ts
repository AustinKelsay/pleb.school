import { describe, expect, it } from "vitest"

import { DEFAULT_SMTP_PORT, resolveEmailRuntimeConfig } from "../email-config"

function makeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    EMAIL_SERVER_HOST: "smtp.example.com",
    EMAIL_SERVER_PORT: "587",
    EMAIL_SERVER_USER: "smtp-user",
    EMAIL_SERVER_PASSWORD: "smtp-password",
    EMAIL_FROM: "noreply@example.com",
    ...overrides,
  } as NodeJS.ProcessEnv
}

describe("email-config", () => {
  it("returns null in non-strict mode when SMTP config is incomplete", () => {
    const result = resolveEmailRuntimeConfig(makeEnv({ EMAIL_SERVER_HOST: undefined }), {
      strict: false,
      context: "test",
    })

    expect(result).toBeNull()
  })

  it("throws in strict mode when SMTP config is incomplete", () => {
    expect(() =>
      resolveEmailRuntimeConfig(makeEnv({ EMAIL_FROM: undefined }), {
        strict: true,
        context: "strict-test",
      })
    ).toThrow("strict-test: Missing required SMTP env vars: EMAIL_FROM.")
  })

  it("throws in strict mode when SMTP port is invalid", () => {
    expect(() =>
      resolveEmailRuntimeConfig(makeEnv({ EMAIL_SERVER_PORT: "70000" }), {
        strict: true,
        context: "strict-test",
      })
    ).toThrow("strict-test: EMAIL_SERVER_PORT must be an integer between 1 and 65535.")
  })

  it("uses default SMTP port in non-strict mode when EMAIL_SERVER_PORT is missing", () => {
    const config = resolveEmailRuntimeConfig(makeEnv({ EMAIL_SERVER_PORT: undefined }), {
      strict: false,
      context: "test",
    })

    expect(config).not.toBeNull()
    expect(config?.server.port).toBe(DEFAULT_SMTP_PORT)
  })

  it("returns null in non-strict mode when SMTP port is non-numeric", () => {
    const config = resolveEmailRuntimeConfig(makeEnv({ EMAIL_SERVER_PORT: "not-a-number" }), {
      strict: false,
      context: "test",
    })

    expect(config).toBeNull()
  })

  it("defaults secure=true for port 465 when EMAIL_SERVER_SECURE is unset", () => {
    const config = resolveEmailRuntimeConfig(
      makeEnv({
        EMAIL_SERVER_PORT: "465",
        EMAIL_SERVER_SECURE: undefined,
      }),
      { strict: true, context: "test" }
    )

    expect(config?.server.secure).toBe(true)
    expect(config?.server.requireTLS).toBe(false)
  })

  it("honors EMAIL_SERVER_SECURE when set to true", () => {
    const config = resolveEmailRuntimeConfig(
      makeEnv({
        EMAIL_SERVER_PORT: "587",
        EMAIL_SERVER_SECURE: "true",
      }),
      { strict: true, context: "test" }
    )

    expect(config?.server.secure).toBe(true)
    expect(config?.server.requireTLS).toBe(false)
  })

  it("honors EMAIL_SERVER_SECURE when set to false", () => {
    const config = resolveEmailRuntimeConfig(
      makeEnv({
        EMAIL_SERVER_PORT: "465",
        EMAIL_SERVER_SECURE: "false",
      }),
      { strict: true, context: "test" }
    )

    expect(config?.server.secure).toBe(false)
    expect(config?.server.requireTLS).toBe(true)
  })

  it("returns normalized runtime config for valid SMTP env", () => {
    const config = resolveEmailRuntimeConfig(
      makeEnv({
        EMAIL_SERVER_HOST: " smtp.example.com ",
        EMAIL_SERVER_USER: " smtp-user ",
        EMAIL_SERVER_PASSWORD: " smtp-password ",
        EMAIL_FROM: " noreply@example.com ",
      }),
      { strict: true, context: "test" }
    )

    expect(config).not.toBeNull()
    expect(config?.server.host).toBe("smtp.example.com")
    expect(config?.server.auth.user).toBe("smtp-user")
    expect(config?.server.auth.pass).toBe("smtp-password")
    expect(config?.server.tls.minVersion).toBe("TLSv1.2")
    expect(config?.server.tls.rejectUnauthorized).toBe(true)
    expect(config?.server.requireTLS).toBe(true)
    expect(config?.from).toBe("noreply@example.com")
  })
})
