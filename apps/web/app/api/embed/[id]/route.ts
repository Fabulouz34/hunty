import { NextResponse } from "next/server";
import { rateLimit, getIP, rateLimitResponse } from "@/lib/rate-limit";
import { getHuntById } from "@/lib/huntStore";

/**
 * Parses the EMBED_ALLOWED_ORIGINS environment variable into a set of
 * lower-cased origin strings.
 *
 * Format: comma-separated origins, e.g.
 *   EMBED_ALLOWED_ORIGINS=https://partner.com,https://blog.example.org
 *
 * An empty or missing variable means any origin is allowed (open mode).
 */
function getAllowedOrigins(): Set<string> | null {
  const raw = process.env.EMBED_ALLOWED_ORIGINS ?? "";
  if (!raw.trim()) return null; // null = open (allow all)
  return new Set(
    raw
      .split(",")
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Validates and normalises an Origin header value.
 * Returns null for missing or opaque ("null") origins.
 */
function parseOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return null;
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Builds the value for Access-Control-Allow-Origin.
 *
 * - If the allow-list is open (null) the route echoes back the requesting
 *   origin (or "*" when there is none) so browsers receive the CORS header
 *   they need to fetch the data.
 * - If an allow-list is configured, only matching origins receive a reflected
 *   ACAO header; others still get the data but the header will be absent so
 *   cross-origin fetches from unlisted sites will be blocked by the browser.
 */
function resolveAcao(
  origin: string | null,
  allowedOrigins: Set<string> | null
): string {
  if (allowedOrigins === null) {
    // Open mode: reflect origin or use wildcard
    return origin ?? "*";
  }
  if (origin && allowedOrigins.has(origin)) {
    return origin; // reflect the exact allowed origin
  }
  return ""; // will be omitted — cross-origin fetch will be blocked by browser
}

/**
 * GET /api/embed/[id]
 *
 * Returns lightweight hunt data for the public embed widget.
 *
 * Rate limiting uses a two-key strategy:
 *   1. Per-IP bucket   – 120 req/min (coarse abuse protection)
 *   2. Per-origin bucket – 300 req/min (generous allowance for high-traffic
 *      embeds on a single domain)
 *
 * When EMBED_ALLOWED_ORIGINS is set, only origins in the allow-list receive
 * the CORS header needed to fetch embed data from the browser.
 *
 * Private hunts return 403 so the widget can display an appropriate message.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getIP(req);
  const origin = parseOrigin(req);
  const allowedOrigins = getAllowedOrigins();

  // ── Rate limiting ────────────────────────────────────────────────────────
  // 1. Per-IP bucket
  const ipResult = await rateLimit(ip, { limit: 120, windowMs: 60 * 1_000 });
  if (!ipResult.success) {
    return rateLimitResponse(ipResult.reset);
  }

  // 2. Per-origin bucket (only when an origin header is present)
  if (origin) {
    const originResult = await rateLimit(`origin:${origin}`, {
      limit: 300,
      windowMs: 60 * 1_000,
    });
    if (!originResult.success) {
      return rateLimitResponse(originResult.reset);
    }
  }

  // ── Hunt lookup ──────────────────────────────────────────────────────────
  const { id } = await params;
  const huntId = parseInt(id, 10);

  if (isNaN(huntId)) {
    return NextResponse.json({ error: "Invalid hunt ID" }, { status: 400 });
  }

  const hunt = getHuntById(huntId);

  if (!hunt) {
    return NextResponse.json({ error: "Hunt not found" }, { status: 404 });
  }

  if (hunt.is_private) {
    return NextResponse.json(
      { error: "This hunt is private and cannot be embedded." },
      { status: 403 }
    );
  }

  // ── Response headers ─────────────────────────────────────────────────────
  const acao = resolveAcao(origin, allowedOrigins);

  const responseHeaders: Record<string, string> = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-RateLimit-Limit": "120",
    "X-RateLimit-Remaining": ipResult.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(ipResult.reset / 1_000).toString(),
  };

  if (acao) {
    responseHeaders["Access-Control-Allow-Origin"] = acao;
    // Required when reflecting a specific origin (not "*")
    if (acao !== "*") {
      responseHeaders["Vary"] = "Origin";
    }
  }

  return NextResponse.json(
    {
      data: {
        id: hunt.id,
        title: hunt.title,
        description: hunt.description,
        cluesCount: hunt.cluesCount,
        status: hunt.status,
        rewardType: hunt.rewardType,
        coverImageCid: hunt.coverImageCid ?? null,
        startTime: hunt.startTime ?? null,
        endTime: hunt.endTime ?? null,
      },
    },
    { headers: responseHeaders }
  );
}

/**
 * OPTIONS /api/embed/[id]
 * Preflight handler so browsers can check CORS before the GET.
 */
export async function OPTIONS(req: Request) {
  const origin = parseOrigin(req);
  const allowedOrigins = getAllowedOrigins();
  const acao = resolveAcao(origin, allowedOrigins);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };

  if (acao) {
    headers["Access-Control-Allow-Origin"] = acao;
    if (acao !== "*") {
      headers["Vary"] = "Origin";
    }
  }

  return new NextResponse(null, { status: 204, headers });
}
