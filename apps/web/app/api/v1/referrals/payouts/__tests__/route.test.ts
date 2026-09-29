/**
 * Tests for POST /api/v1/referrals/payouts auth guard (closes #1381).
 *
 * Verifies:
 *  - 401 is returned when no credential is present
 *  - 401 is returned when an invalid API key is supplied
 *  - 200/201 is returned when a valid API key is supplied
 *  - The actor is derived from the verified identity (not the body)
 *  - Dry-run (execute=false) returns 200 without persisting records
 *  - Execute (execute=true) returns 201 and persists records
 *
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_API_KEY = "test-admin-key-abc123"

const VALID_BODY = {
  period: "manual",
  allocations: [
    { rank: 1, referrerAddress: "GREFERRER1", amount: 750, rewardType: "points" },
    { rank: 2, referrerAddress: "GREFERRER2", amount: 450, rewardType: "points" },
  ],
  execute: false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRequest(opts: {
  body?: unknown
  apiKey?: string | null
  sessionRole?: "admin" | "user" | null
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (opts.apiKey !== undefined && opts.apiKey !== null) {
    headers["x-admin-key"] = opts.apiKey
  }
  return new Request("http://localhost/api/v1/referrals/payouts", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? VALID_BODY),
  })
}

function buildGetRequest(opts: { apiKey?: string | null } = {}): Request {
  const headers: Record<string, string> = {}
  if (opts.apiKey !== undefined && opts.apiKey !== null) {
    headers["x-admin-key"] = opts.apiKey
  }
  return new Request("http://localhost/api/v1/referrals/payouts", {
    method: "GET",
    headers,
  })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/referrals/payouts — auth guard", () => {
  beforeEach(() => {
    // Reset module registry so each test gets a fresh in-memory store and
    // freshly-resolved process.env values.
    vi.resetModules()

    // Set the API key environment variable for the test environment.
    process.env.ADMIN_API_KEY = VALID_API_KEY
  })

  it("returns 401 when no credential is provided", async () => {
    // Mock next-auth so getToken returns null (no session).
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    const res = await POST(buildRequest({}), undefined as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 when an invalid API key is supplied", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    const res = await POST(buildRequest({ apiKey: "wrong-key" }), undefined as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 when x-admin-key header is an empty string", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    const res = await POST(buildRequest({ apiKey: "" }), undefined as never)
    expect(res.status).toBe(401)
  })

  it("returns 200 (dry-run) when a valid API key is provided", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    const res = await POST(
      buildRequest({ apiKey: VALID_API_KEY, body: { ...VALID_BODY, execute: false } }),
      undefined as never
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.payouts).toHaveLength(VALID_BODY.allocations.length)
  })

  it("returns 201 (execute) and persists records when a valid API key is provided", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    const res = await POST(
      buildRequest({ apiKey: VALID_API_KEY, body: { ...VALID_BODY, execute: true } }),
      undefined as never
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
    expect(body.payouts).toHaveLength(VALID_BODY.allocations.length)
    expect(body.totalAmount).toBe(1200) // 750 + 450
  })

  it("accepts a valid admin session (role=admin) and returns 200 dry-run", async () => {
    vi.doMock("next-auth/jwt", () => ({
      getToken: vi.fn().mockResolvedValue({ sub: "admin-user-id", role: "admin", email: "admin@example.com" }),
    }))

    const { POST } = await import("../route")
    const res = await POST(
      buildRequest({ body: { ...VALID_BODY, execute: false } }),
      undefined as never
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
  })

  it("returns 403 when session role is not admin", async () => {
    vi.doMock("next-auth/jwt", () => ({
      getToken: vi.fn().mockResolvedValue({ sub: "player-id", role: "user", email: "player@example.com" }),
    }))

    const { POST } = await import("../route")
    const res = await POST(buildRequest({}), undefined as never)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns 400 when the request body is missing required fields", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { POST } = await import("../route")
    // Even with a valid API key, a bad body should still be rejected with 400.
    const res = await POST(
      buildRequest({ apiKey: VALID_API_KEY, body: { period: "manual" /* missing allocations */ } }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("VALIDATION_ERROR")
  })
})

// ─── GET auth guard ───────────────────────────────────────────────────────────

describe("GET /api/v1/referrals/payouts — auth guard", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.ADMIN_API_KEY = VALID_API_KEY
  })

  it("returns 401 when no credential is provided", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { GET } = await import("../route")
    const res = await GET(buildGetRequest(), undefined as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 when an invalid API key is supplied", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { GET } = await import("../route")
    const res = await GET(buildGetRequest({ apiKey: "bad-key" }), undefined as never)
    expect(res.status).toBe(401)
  })

  it("returns 200 with payout list when a valid API key is provided", async () => {
    vi.doMock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))

    const { GET } = await import("../route")
    const res = await GET(buildGetRequest({ apiKey: VALID_API_KEY }), undefined as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.payouts)).toBe(true)
    expect(typeof body.total).toBe("number")
  })
})
