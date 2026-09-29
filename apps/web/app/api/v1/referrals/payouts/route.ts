import { NextResponse } from "next/server"
import { withValidation } from "@/lib/api/withValidation"
import { getIP, rateLimit, rateLimitPresets, rateLimitResponse } from "@/lib/rate-limit"
import { withErrorHandling } from "@/lib/api/withErrorHandling"
import { getAllPayouts, processReferralPayouts } from "@/lib/referralStore"
import { referralPayoutBodySchema } from "@hunty/types/api-schemas"
import { assertAdminAuth } from "@/lib/api/adminAuth"
import { AuthError } from "@/lib/api/errors"
import { auditLog } from "@/lib/audit"

// ─── Shared admin guard ───────────────────────────────────────────────────────

/**
 * Verifies the request comes from an admin.
 *
 * Accepts either:
 *  - A valid `x-admin-key` header matching `process.env.ADMIN_API_KEY` (for
 *    background jobs / CI pipelines), or
 *  - A NextAuth session JWT with `role === "admin"` (for interactive admin UI).
 *
 * Throws `AuthError` (401) when neither credential is present or valid.
 */
async function requireAdmin(req: Request) {
  const adminKey = req.headers.get("x-admin-key")

  if (adminKey !== null) {
    if (adminKey !== process.env.ADMIN_API_KEY) {
      auditLog(
        "referral-payouts.unauthorized",
        { reason: "invalid_api_key", path: new URL(req.url).pathname },
        "api-key"
      )
      throw new AuthError("Invalid API key")
    }
    return { id: "api-key", email: "api-key@internal", role: "admin" }
  }

  // Falls through to session-based auth; assertAdminAuth throws on failure.
  return assertAdminAuth(req)
}

// ─── GET /api/v1/referrals/payouts ────────────────────────────────────────────

/**
 * Returns all referral payout records (pending, processing, paid, failed).
 * Admin-only: requires a valid admin session or API key.
 */
export const GET = withErrorHandling(async (req: Request) => {
  const ip = getIP(req)
  const { success, reset } = await rateLimit(ip, rateLimitPresets.read)
  if (!success) return rateLimitResponse(reset)

  const admin = await requireAdmin(req)

  auditLog("referral-payouts.list", { path: new URL(req.url).pathname }, admin.id)

  const payouts = getAllPayouts()
  return NextResponse.json({ payouts, total: payouts.length })
})

// ─── POST /api/v1/referrals/payouts ───────────────────────────────────────────

/**
 * Calculates and optionally executes reward payout allocations for top referrers.
 *
 * Admin-only: only an admin session or a background-job API key may call this.
 * The actor is derived from the verified identity, not the request body.
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
 * Auth:
 *   - x-admin-key: <ADMIN_API_KEY>   (background jobs / CI)
 *   - NextAuth session with role=admin  (admin UI)
 *
 * Errors:
 *   - 401 Unauthorized — no valid credential supplied
 *   - 403 Forbidden — credential present but insufficient privileges
 */
export const POST = withValidation(
  { body: referralPayoutBodySchema },
  async (req: Request, _context, { body }) => {
    const ip = getIP(req)
    const { success, reset } = await rateLimit(ip, rateLimitPresets.sensitive)
    if (!success) return rateLimitResponse(reset)

    // Auth guard: throws 401/403 if the caller is not an admin.
    const admin = await requireAdmin(req)

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

    auditLog(
      body.execute ? "referral-payouts.execute" : "referral-payouts.dry-run",
      {
        period: body.period,
        allocationCount: body.allocations.length,
        totalAmount: result.totalAmount,
        dryRun: result.dryRun,
      },
      admin.id
    )

    return NextResponse.json(result, { status: body.execute ? 201 : 200 })
  }
)
