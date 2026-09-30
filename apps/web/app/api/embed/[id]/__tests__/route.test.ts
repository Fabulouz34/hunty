// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

/**
 * Mock the rate-limit module so tests control success/failure without
 * relying on timing or an in-memory counter that leaks between tests.
 */
const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  getIP: (req: Request) => req.headers.get("x-forwarded-for") ?? "127.0.0.1",
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  rateLimitResponse: (reset: number) => {
    const { NextResponse } = require("next/server");
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Reset": Math.ceil(reset / 1000).toString(),
          "Retry-After": "60",
        },
      }
    );
  },
}));

/**
 * Mock the hunt store so tests are deterministic and don't depend on seeded
 * fixture data changing.
 */
const mockGetHuntById = vi.fn();
vi.mock("@/lib/huntStore", () => ({
  getHuntById: (id: number) => mockGetHuntById(id),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a request to GET /api/embed/:id */
function makeRequest(
  id: string | number,
  options: { origin?: string; ip?: string } = {}
): Request {
  const headers: Record<string, string> = {};
  if (options.origin) headers["origin"] = options.origin;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new Request(`http://localhost/api/embed/${id}`, { headers });
}

/** Creates a preflight OPTIONS request */
function makeOptions(origin?: string): Request {
  const headers: Record<string, string> = {
    "access-control-request-method": "GET",
  };
  if (origin) headers["origin"] = origin;
  return new Request("http://localhost/api/embed/1", {
    method: "OPTIONS",
    headers,
  });
}

/** A minimal public hunt fixture */
const publicHunt = {
  id: 1,
  title: "City Secrets",
  description: "Find the hidden murals.",
  cluesCount: 5,
  status: "Active",
  rewardType: "XLM",
  is_private: false,
  coverImageCid: null,
  startTime: null,
  endTime: null,
};

const privateHunt = { ...publicHunt, id: 2, is_private: true };

/** Configures the rate-limit mock to always allow */
function allowRateLimit() {
  mockRateLimit.mockResolvedValue({ success: true, remaining: 119, reset: Date.now() + 60_000 });
}

/** Configures the rate-limit mock to deny on the N-th call */
function denyRateLimitOnCall(n: number) {
  mockRateLimit.mockImplementation(async () => ({
    success: mockRateLimit.mock.calls.length < n,
    remaining: 0,
    reset: Date.now() + 30_000,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/embed/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMBED_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    delete process.env.EMBED_ALLOWED_ORIGINS;
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it("returns 200 with hunt data for a public hunt", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const req = makeRequest(1);
    const res = await GET(req, { params: Promise.resolve({ id: "1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe("City Secrets");
    expect(body.data.cluesCount).toBe(5);
    expect(body.data.status).toBe("Active");
  });

  it("includes cache-control header on success", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(1), { params: Promise.resolve({ id: "1" }) });

    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("exposes rate-limit headers on success", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(1), { params: Promise.resolve({ id: "1" }) });

    expect(res.headers.get("x-ratelimit-limit")).toBe("120");
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
    expect(res.headers.get("x-ratelimit-reset")).toBeDefined();
  });

  // ── CORS / origin allow-list ───────────────────────────────────────────

  it("returns ACAO: * (wildcard) when EMBED_ALLOWED_ORIGINS is unset and no origin header", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(1), { params: Promise.resolve({ id: "1" }) });

    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("reflects the requesting origin when EMBED_ALLOWED_ORIGINS is unset", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(1, { origin: "https://partner.com" }),
      { params: Promise.resolve({ id: "1" }) }
    );

    expect(res.headers.get("access-control-allow-origin")).toBe("https://partner.com");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("reflects origin when it is in the allow-list", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "https://partner.com,https://blog.example.org";
    vi.resetModules(); // re-import so the new env var is picked up
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(1, { origin: "https://partner.com" }),
      { params: Promise.resolve({ id: "1" }) }
    );

    expect(res.headers.get("access-control-allow-origin")).toBe("https://partner.com");
  });

  it("omits ACAO header when origin is not in the allow-list", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "https://partner.com";
    vi.resetModules();
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(1, { origin: "https://evil.com" }),
      { params: Promise.resolve({ id: "1" }) }
    );

    // Header absent or empty — unlisted origin must not receive a CORS grant
    const acao = res.headers.get("access-control-allow-origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("treats EMBED_ALLOWED_ORIGINS matching as case-insensitive on the stored list", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "HTTPS://PARTNER.COM";
    vi.resetModules();
    allowRateLimit();
    mockGetHuntById.mockReturnValue(publicHunt);

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(1, { origin: "https://partner.com" }),
      { params: Promise.resolve({ id: "1" }) }
    );

    expect(res.headers.get("access-control-allow-origin")).toBe("https://partner.com");
  });

  // ── Rate limiting ──────────────────────────────────────────────────────

  it("returns 429 when the per-IP limit is exceeded", async () => {
    // First call (IP bucket) returns denied
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });
    vi.resetModules();

    const { GET } = await import("../route");
    const res = await GET(makeRequest(1, { ip: "10.0.0.1" }), {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("returns 429 when the per-origin limit is exceeded", async () => {
    // IP bucket passes, per-origin bucket fails
    mockRateLimit
      .mockResolvedValueOnce({ success: true, remaining: 119, reset: Date.now() + 60_000 })
      .mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() + 30_000 });
    vi.resetModules();

    const { GET } = await import("../route");
    const res = await GET(
      makeRequest(1, { origin: "https://busy.com" }),
      { params: Promise.resolve({ id: "1" }) }
    );

    expect(res.status).toBe(429);
  });

  it("skips the per-origin rate-limit check when no origin header is present", async () => {
    // Only one call should be made (the IP check); if a second call is made
    // with no origin configured the test would fail.
    mockRateLimit.mockResolvedValue({ success: true, remaining: 119, reset: Date.now() + 60_000 });
    mockGetHuntById.mockReturnValue(publicHunt);
    vi.resetModules();

    const { GET } = await import("../route");
    await GET(makeRequest(1), { params: Promise.resolve({ id: "1" }) });

    // Only the IP bucket call should have been made
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
  });

  // ── Private hunt gate ──────────────────────────────────────────────────

  it("returns 403 for a private hunt", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(privateHunt);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(2), { params: Promise.resolve({ id: "2" }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/private/i);
  });

  // ── Not found / bad input ──────────────────────────────────────────────

  it("returns 404 when the hunt does not exist", async () => {
    allowRateLimit();
    mockGetHuntById.mockReturnValue(undefined);

    const { GET } = await import("../route");
    const res = await GET(makeRequest(999), { params: Promise.resolve({ id: "999" }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric hunt ID", async () => {
    allowRateLimit();

    const { GET } = await import("../route");
    const res = await GET(makeRequest("abc"), { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });
});

// ── OPTIONS preflight ──────────────────────────────────────────────────────

describe("OPTIONS /api/embed/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMBED_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    delete process.env.EMBED_ALLOWED_ORIGINS;
  });

  it("returns 204 with CORS headers", async () => {
    const { OPTIONS } = await import("../route");
    const res = await OPTIONS(makeOptions("https://partner.com"));

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("reflects the requesting origin in open mode", async () => {
    const { OPTIONS } = await import("../route");
    const res = await OPTIONS(makeOptions("https://any.com"));

    expect(res.headers.get("access-control-allow-origin")).toBe("https://any.com");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("reflects origin in the allow-list", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "https://allowed.com";
    vi.resetModules();

    const { OPTIONS } = await import("../route");
    const res = await OPTIONS(makeOptions("https://allowed.com"));

    expect(res.headers.get("access-control-allow-origin")).toBe("https://allowed.com");
  });

  it("omits ACAO header for unlisted origin", async () => {
    process.env.EMBED_ALLOWED_ORIGINS = "https://allowed.com";
    vi.resetModules();

    const { OPTIONS } = await import("../route");
    const res = await OPTIONS(makeOptions("https://blocked.com"));

    const acao = res.headers.get("access-control-allow-origin");
    expect(!acao || acao === "").toBe(true);
  });

  it("returns * when no origin header and open mode", async () => {
    const { OPTIONS } = await import("../route");
    const res = await OPTIONS(makeOptions()); // no origin

    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
