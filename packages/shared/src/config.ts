// All tunables live here: weights, thresholds, TTLs, batch sizes, concurrency.
// Exception: the per-IP request limit is set on the rate limit binding in
// apps/worker/wrangler.toml, because Cloudflare reads it from there.

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;

// Freshness

/**
 * Etsy's API terms forbid displaying listing content more than 6 hours older than Etsy's own
 * site. Every cache layer combined must stay within this, measured from `fetchedAt`.
 */
export const ETSY_LISTING_MAX_AGE_MS = 6 * HOUR_MS;

/** How long a stored verdict stays fresh in the client cache, measured from `fetchedAt`. */
export const VERDICT_TTL_MS = ETSY_LISTING_MAX_AGE_MS;

/**
 * How long the Worker's edge cache keeps listing data. Kept well under the 6-hour limit so
 * clients still get most of the freshness budget.
 */
export const EDGE_CACHE_TTL_MS = 2 * HOUR_MS;

/** How long the Worker remembers that Etsy said a listing doesn't exist. */
export const MISSING_LISTING_CACHE_TTL_MS = 1 * HOUR_MS;

// Batching

/** Max listing IDs per /v1/listings request. Matches Etsy's batch cap: one Etsy call per request. */
export const MAX_IDS_PER_REQUEST = 100;

/** How long the content script collects newly visible listing IDs before sending a batch. */
export const BATCH_DELAY_MS = 300;

/** Max concurrent requests from the extension to the Worker. */
export const WORKER_CONCURRENCY = 2;

/** After the Worker reports listings unavailable (or fails), pause new requests this long. */
export const WORKER_BACKOFF_MS = 30 * SECOND_MS;

// Signals

/** Default weight per signal id (0 to 1). Tuned for precision in Phase 9. */
export const SIGNAL_WEIGHTS = {
  /** Strong: the seller's own words say AI was used. */
  descriptionDisclosure: 1,
  /** Moderate: outside production partner. Common for print-on-demand, never proof alone. */
  designedBy: 0.25,
} as const;
