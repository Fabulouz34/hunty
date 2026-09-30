# Hunty Embed Widget

Hunty provides a public iframe embed that displays a compact hunt card — title,
status badge, reward type, clue count, cover image, and a deep-link CTA button.
It is designed to be dropped into any third-party website or blog post.

---

## Quick start

Copy and paste the snippet below, replacing `{HUNT_ID}` with the numeric hunt ID
(visible in the URL of any hunt page, e.g. `https://hunty.app/hunt/42`):

```html
<!-- Hunty embed widget -->
<iframe
  src="https://hunty.app/hunt/{HUNT_ID}/embed"
  title="Hunty scavenger hunt"
  width="340"
  height="480"
  style="border:none; border-radius:12px; overflow:hidden;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  allowfullscreen
></iframe>
```

> **Recommended dimensions** — `340 × 480 px` for the standard card layout.
> The widget is responsive and will adapt to the iframe width you provide, down
> to about `280 px`.

---

## Embedded URL

```
GET https://hunty.app/hunt/{id}/embed
```

The page is a self-contained Server Component.  It includes all styles inline
so it renders correctly inside cross-origin iframes without any external CSS
dependencies.

### Responsive behaviour

| Container width | Behaviour |
|-----------------|-----------|
| ≥ 340 px        | Full card with cover image, description, meta row, CTA, and footer |
| 280–339 px      | Same layout; cover image may crop tighter; text clamps at 2 lines |
| < 280 px        | Not officially supported; layout degrades gracefully |

The widget also supports **dark mode** via `prefers-color-scheme: dark` media
query.  The host page does not need to do anything; the card detects the
visitor's system preference automatically.

---

## Data API

The embed page sources its data from the underlying REST endpoint:

```
GET https://hunty.app/api/embed/{id}
```

Third-party sites can also call this endpoint directly to build custom widgets.

### Response

```json
{
  "data": {
    "id": 42,
    "title": "City Secrets",
    "description": "Race across town to uncover hidden murals.",
    "cluesCount": 5,
    "status": "Active",
    "rewardType": "XLM",
    "coverImageCid": "https://gateway.pinata.cloud/ipfs/Qm...",
    "startTime": 1717156800,
    "endTime": 1717848000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Hunt identifier |
| `title` | `string` | Hunt title |
| `description` | `string \| null` | Short hunt description |
| `cluesCount` | `number` | Number of clues in the hunt |
| `status` | `"Active" \| "Draft" \| "Completed" \| "Cancelled"` | Current hunt status |
| `rewardType` | `"XLM" \| "NFT" \| "Both"` | Reward type |
| `coverImageCid` | `string \| null` | Cover image URL (IPFS gateway URL or `null`) |
| `startTime` | `number \| null` | Unix timestamp for hunt start |
| `endTime` | `number \| null` | Unix timestamp for hunt end |

### Error responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | `id` is not a valid integer |
| `403 Forbidden` | Hunt exists but is marked private |
| `404 Not Found` | No hunt with that ID |
| `429 Too Many Requests` | Rate limit exceeded (see below) |

---

## CORS

The embed API supports cross-origin requests so browsers can call it directly
from JavaScript.

### Open mode (default)

When `EMBED_ALLOWED_ORIGINS` is **not** set, the API operates in open mode:

- Requests with an `Origin` header receive `Access-Control-Allow-Origin: <origin>` (reflected).
- Requests without an `Origin` header receive `Access-Control-Allow-Origin: *`.

### Restricted mode

Set `EMBED_ALLOWED_ORIGINS` to a comma-separated list of allowed origins:

```
EMBED_ALLOWED_ORIGINS=https://partner.com,https://blog.example.org
```

- Listed origins receive `Access-Control-Allow-Origin: <origin>`.
- Unlisted origins receive **no** `Access-Control-Allow-Origin` header, so
  browser cross-origin fetches from those origins will be blocked.
- Matching is **case-insensitive** (e.g. `HTTPS://PARTNER.COM` matches
  `https://partner.com`).

### OPTIONS preflight

The API handles `OPTIONS` preflight requests and responds with:

```
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

---

## Rate limiting

The embed API enforces two independent sliding-window rate limits:

| Bucket | Limit | Window | Keyed by |
|--------|-------|--------|----------|
| Per IP | 120 req | 60 s | Client IP (`x-forwarded-for` or socket address) |
| Per origin | 300 req | 60 s | `Origin` header value (skipped when absent) |

When the limit is exceeded the API returns `429 Too Many Requests`:

```json
{
  "error": "Too many requests. Please try again later.",
  "code": "RATE_LIMITED"
}
```

Response headers indicate when to retry:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |
| `Retry-After` | Seconds to wait before retrying |

Successful responses include informational rate-limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Configured per-IP limit (120) |
| `X-RateLimit-Remaining` | Remaining requests in the current IP window |
| `X-RateLimit-Reset` | Unix timestamp when the IP window resets |

---

## Framing headers

The embed page (`/hunt/{id}/embed`) is served with headers that allow it to be
framed:

| Header | Value |
|--------|-------|
| `Content-Security-Policy: frame-ancestors` | `*` by default; space-separated origins when `EMBED_ALLOWED_ORIGINS` is set |
| `X-Frame-Options` | `SAMEORIGIN` (legacy fallback for old browsers) |

All other pages on hunty.app set `frame-ancestors 'none'` and
`X-Frame-Options: DENY`, so only the explicit embed route can be iframed.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EMBED_ALLOWED_ORIGINS` | No | Comma-separated list of origins allowed to embed. Leave unset for open mode. Example: `https://partner.com,https://blog.example.org` |
| `NEXT_PUBLIC_BASE_URL` | No | Base URL used to generate hunt deep-links inside the card. Defaults to `https://hunty.app` |

---

## Privacy & security notes

- Only **public** hunts can be embedded. Attempting to embed a private hunt
  returns a `403` and the widget displays a locked-state card.
- The embed page sets `robots: noindex, nofollow` so search engines do not
  index the isolated card pages.
- CTA and "Powered by" links open in a **new tab** (`target="_blank"`) with
  `rel="noopener noreferrer"` to prevent opener exploitation.
- No cookies or tracking scripts are included in the embed page.

---

## Caching

The API response is publicly cacheable:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

CDN edges will cache responses for 60 seconds and serve stale content for up to
5 minutes while revalidating in the background.  This means hunt status changes
(e.g. Active → Completed) may take up to 5 minutes to appear in embedded cards.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-30 | Initial release — embed page, data API, origin-aware rate limiting |
