import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ─── Schema mock ─────────────────────────────────────────────────────────────
// We mock @hunty/types/api-schemas to avoid a pre-existing ReferenceError in
// the package (huntRefundBodySchema is referenced in the re-export map but
// never defined). The factory is self-contained so vi.mock hoisting works.
vi.mock("@hunty/types/api-schemas", async () => {
  const { z } = await import("zod")
  const referralPayoutAllocationSchema = z.object({
    rank: z.number().int().min(1),
    referrerAddress: z.string().min(1),
    amount: z.number().positive(),
    rewardType: z.enum(["xlm", "points"]),
  })
  return {
    referralPayoutBodySchema: z.object({
      period: z.enum(["weekly", "monthly", "seasonal", "manual"]).default("manual"),
      allocations: z.array(referralPayoutAllocationSchema).min(1),
      execute: z.boolean().optional().default(false),
    }),
    referralPayoutAllocationSchema,
  }
})

// ─── Auth + audit mocks ───────────────────────────────────────────────────────

const mockAssertAdminAuth = vi.fn()
const mockAuditLog = vi.fn()

vi.mock("@/lib/api/adminAuth", () => ({
  assertAdminAuth: (...args: unknown[]) => mockAssertAdminAuth(...args),
}))

vi.mock("@/lib/audit", () => ({
  auditLog: (...args: unknown[]) => mockAuditLog(...args),
}))

// ─── Static imports (after mocks are hoisted) ─────────────────────────────────

import { AuthError, ForbiddenError } from "@/lib/api/errors"
import { GET, POST } from "../route"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost/api/v1/referrals/payouts"

const VALID_BODY = {
  period: "weekly" as const,
  allocations: [
    {
      rank: 1,
      referrerAddress: "GALICE00000000000000000000000000000000000000000000000",
      amount: 750,
      rewardType: "points" as const,
    },
    {
      rank: 2,
      referrerAddress: "GBOB000000000000000000000000000000000000000000000000",
      amount: 450,
      rewardType: "points" as const,
    },
  ],
  execute: false,
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function getRequest(headers: Record<string, string> = {}) {
  return new Request(BASE_URL, { method: "GET", headers })
}

function withBearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/referrals/payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_API_KEY
  })

  afterEach(() => {
    delete process.env.ADMIN_API_KEY
  })

  // ── Unauthenticated / unauthorized cases ──────────────────────────────────

  it("returns 401 when no auth header and no admin session (AuthError)", async () => {
    mockAssertAdminAuth.mockRejectedValue(new AuthError("Unauthorized"))

    const res = await POST(postRequest(VALID_BODY) as any)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 403 when session role is not admin (ForbiddenError)", async () => {
    mockAssertAdminAuth.mockRejectedValue(new ForbiddenError("Forbidden"))

    const res = await POST(postRequest(VALID_BODY) as any)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns 401 when bearer token is wrong and ADMIN_API_KEY is set", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await POST(postRequest(VALID_BODY, withBearer("wrong-key")) as any)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
    // assertAdminAuth must NOT have been called — bearer path fires first
    expect(mockAssertAdminAuth).not.toHaveBeenCalled()
  })

  it("returns 401 when ADMIN_API_KEY env var is not configured and bearer is supplied (fail closed)", async () => {
    // No ADMIN_API_KEY set — service auth must fail closed
    // The route will fall through to assertAdminAuth; we simulate no session
    mockAssertAdminAuth.mockRejectedValue(new AuthError("Unauthorized"))

    const res = await POST(postRequest(VALID_BODY, withBearer("any-token")) as any)

    expect(res.status).toBe(401)
  })

  // ── Authenticated cases ───────────────────────────────────────────────────

  it("accepts a valid ADMIN_API_KEY bearer token and returns 200 for dry-run", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await POST(postRequest(VALID_BODY, withBearer("correct-key")) as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
    expect(body.payouts).toHaveLength(2)
    // assertAdminAuth should NOT be called when bearer succeeds
    expect(mockAssertAdminAuth).not.toHaveBeenCalled()
  })

  it("accepts a valid ADMIN_API_KEY bearer token and returns 201 when execute=true", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await POST(
      postRequest({ ...VALID_BODY, execute: true }, withBearer("correct-key")) as any
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.dryRun).toBe(false)
  })

  it("accepts an admin session token and returns 200", async () => {
    mockAssertAdminAuth.mockResolvedValue({
      id: "admin-123",
      email: "admin@example.com",
      role: "admin",
    })

    const res = await POST(postRequest(VALID_BODY) as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
  })

  it("derives the actor from the bearer credential, not the request body", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    await POST(postRequest(VALID_BODY, withBearer("correct-key")) as any)

    expect(mockAuditLog).toHaveBeenCalledWith(
      "referral_payout.create",
      expect.objectContaining({ period: "weekly" }),
      "service:admin-api-key" // actor from credential, not body
    )
  })

  it("derives the actor from the session email when using admin session auth", async () => {
    mockAssertAdminAuth.mockResolvedValue({
      id: "admin-123",
      email: "admin@example.com",
      role: "admin",
    })

    await POST(postRequest(VALID_BODY) as any)

    expect(mockAuditLog).toHaveBeenCalledWith(
      "referral_payout.create",
      expect.any(Object),
      "admin@example.com" // actor from session email
    )
  })

  it("returns 400 for a missing required body field even with valid auth", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await POST(
      postRequest({ period: "weekly" }, withBearer("correct-key")) as any
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("VALIDATION_ERROR")
  })

  it("does not create payouts when execute is omitted (defaults to dry-run)", async () => {
    process.env.ADMIN_API_KEY = "correct-key"
    const bodyWithoutExecute = { period: "weekly", allocations: VALID_BODY.allocations }

    const res = await POST(postRequest(bodyWithoutExecute, withBearer("correct-key")) as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dryRun).toBe(true)
  })
})

describe("GET /api/v1/referrals/payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_API_KEY
  })

  afterEach(() => {
    delete process.env.ADMIN_API_KEY
  })

  it("returns 401 when no auth is provided and no admin session", async () => {
    mockAssertAdminAuth.mockRejectedValue(new AuthError("Unauthorized"))

    const res = await GET(getRequest() as any, {} as any)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 403 when session role is not admin", async () => {
    mockAssertAdminAuth.mockRejectedValue(new ForbiddenError("Forbidden"))

    const res = await GET(getRequest() as any, {} as any)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("FORBIDDEN")
  })

  it("returns 401 when bearer token is incorrect", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await GET(getRequest(withBearer("wrong-key")) as any, {} as any)

    expect(res.status).toBe(401)
  })

  it("returns 200 with payout list for a valid bearer token", async () => {
    process.env.ADMIN_API_KEY = "correct-key"

    const res = await GET(getRequest(withBearer("correct-key")) as any, {} as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.payouts)).toBe(true)
    expect(typeof body.total).toBe("number")
  })

  it("returns 200 with payout list for an admin session", async () => {
    mockAssertAdminAuth.mockResolvedValue({
      id: "admin-789",
      email: "admin@example.com",
      role: "admin",
    })

    const res = await GET(getRequest() as any, {} as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.payouts)).toBe(true)
  })
})
