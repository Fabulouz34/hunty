import { NextResponse } from "next/server"
import { withValidation } from "@/lib/api/withValidation"
import { getIP, rateLimit, rateLimitPresets, rateLimitResponse } from "@/lib/rate-limit"
import { withErrorHandling } from "@/lib/api/withErrorHandling"
import { getAllPayouts, processReferralPayouts } from "@/lib/referralStore"
import { referralPayoutBodySchema } from "@hunty/types/api-schemas"
import { assertAdminAuth } from "@/lib/api/adminAuth"
import { AuthError } from "@/lib/api/errors"
import { auditLog } from "@/lib/audit"

/**
 * Asserts that the caller is either:
 *   1. An authenticated admin session (next-auth JWT with role=admin), or
 *   2. A background-job credential supplied as `Authorization: Bearer <ADMIN_API_KEY>`.
 *
 * Throws AuthError (→ 401) when neither condition is met.
 * Returns a string actor identifier so the caller can include it in audit logs.
 */
async function assertAdminOrServiceAuth(req: Request): Promise<string> {
  // Path 1 — Bearer token for background-job / service-to-service calls
  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const adminApiKey = process.env.ADMIN_API_KEY

    if (!adminApiKey) {
      // Fail closed: if no key is configured, bearer auth is unavailable.
      throw new AuthError("Service authentication is not configured")
    }

    if (token !== adminApiKey) {
      auditLog(
        "unauthorized",
        { path: new URL(req.url).pathname, reason: "invalid_bearer_token" },
        "anonymous"
      )
      throw new AuthError("Invalid API key")
    }

    return "service:admin-api-key"
  }

  // Path 2 — Admin session via next-auth JWT
  const admin = await assertAdminAuth(req)
  return admin.email ?? admin.id
}

/**
 * GET /api/v1/referrals/payouts
 *
 * Returns all referral payout records (pending, processing, paid, failed).
 * Requires admin session or service bearer token.
 */
export const GET = withErrorHandling(async (req: Request) => {
  const ip = getIP(req)
  const { success, reset } = await rateLimit(ip, rateLimitPresets.read)
  if (!success) return rateLimitResponse(reset)

  await assertAdminOrServiceAuth(req)

  const payouts = getAllPayouts()
  return NextResponse.json({ payouts, total: payouts.length })
})

/**
 * POST /api/v1/referrals/payouts
 *
 * Calculates and optionally executes reward payout allocations for top referrers.
 *
 * Only admins and authorised background jobs may call this endpoint. The actor
 * identity is derived from the verified credential — never from the request body.
 *
 * When execute=false (default), returns a dry-run preview without persisting anything.
 * When execute=true, creates payout records with status "pending".
 *
 * Default reward tiers (caller may supply any allocations array):
 *   Rank 1 → 750 pts
 *   Rank 2 → 450 pts
 *   Rank 3 → 200 pts
 *
 * Request body: { period, allocations: [{ rank, referrerAddress, amount, rewardType }], execute? }
 *
 * Authentication:
 *   - Admin session:  next-auth JWT with role=admin
 *   - Background job: Authorization: Bearer <ADMIN_API_KEY>
 *
 * Returns 401 when unauthenticated, 403 when authenticated but not admin.
 */
export const POST = withValidation(
  { body: referralPayoutBodySchema },
  async (req: Request, _context, { body }) => {
    const ip = getIP(req)
    const { success, reset } = await rateLimit(ip, rateLimitPresets.sensitive)
    if (!success) return rateLimitResponse(reset)

    // Auth check — must come before any business logic.
    // The actor is derived from the verified credential, not the request body.
    const actor = await assertAdminOrServiceAuth(req)

    auditLog(
      "referral_payout.create",
      {
        period: body.period,
        allocationCount: body.allocations.length,
        execute: body.execute ?? false,
      },
      actor
    )

    const result = processReferralPayouts(
      body.period,
      body.allocations.map((a) => ({
        rank: a.rank,
        referrerAddress: a.referrerAddress,
        amount: a.amount,
        rewardType: a.rewardType,
      })),
      body.execute
    )

    return NextResponse.json(result, { status: body.execute ? 201 : 200 })
  }
)
