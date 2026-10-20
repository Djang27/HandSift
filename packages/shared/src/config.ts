import type { Sensitivity, Settings } from "./schemas/settings";

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

/**
 * How long the shared D1 cache keeps listing data (with its shop). Clients measure
 * freshness from the original fetch, so this leaves them at least 3 of Etsy's 6 hours.
 */
export const D1_CACHE_TTL_MS = 3 * HOUR_MS;

/** How long the Worker remembers that Etsy said a listing doesn't exist. */
export const MISSING_LISTING_CACHE_TTL_MS = 1 * HOUR_MS;

/** How often the client cache deletes expired verdicts (Etsy: don't keep data longer than needed). */
export const VERDICT_PRUNE_INTERVAL_MS = 1 * HOUR_MS;

/**
 * Score at or above which a listing with no disclosure is shown as "likely AI", per
 * sensitivity. Inference weights combine as 1 - (1 - w1)(1 - w2)...; designedBy alone
 * (0.25) never reaches any threshold. Tuned for precision in Phase 9.
 */
export const LIKELY_AI_THRESHOLDS: Record<Sensitivity, number> = {
  conservative: 0.8,
  balanced: 0.6,
  aggressive: 0.4,
};

/** Blur radius for listing photos in blur mode. */
export const BLUR_RADIUS_PX = 14;

// Settings

/** Precision first: on, label only, flag inferred AI conservatively. */
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "label",
  sensitivity: "conservative",
};

// Batching

/** Max listing IDs per /v1/listings request. Matches Etsy's batch cap: one Etsy call per request. */
export const MAX_IDS_PER_REQUEST = 100;

/** How long the content script collects new listing IDs before sending a batch. */
export const BATCH_DELAY_MS = 300;

/** After the page changes (infinite scroll, filters), wait this long before rescanning. */
export const PAGE_SCAN_DEBOUNCE_MS = 150;

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
  /** Weak to moderate: shop-level clues. The most the combined clues can add. */
  shopHeuristics: 0.55,
} as const;

/**
 * shopHeuristics clues. Each is weak alone; they combine as 1 - (1 - w1)(1 - w2)...,
 * capped at SIGNAL_WEIGHTS.shopHeuristics. Minimum listing counts keep small shops out.
 */
export const SHOP_HEURISTICS = {
  /** "New shop with a huge catalog": opened within this many days... */
  newShopMaxAgeDays: 180,
  /** ...and already has at least this many active listings. */
  bulkMinListings: 300,
  newBulkWeight: 0.35,

  /** "Mostly digital downloads": at least this share of listings digital... */
  digitalMinShare: 0.9,
  /** ...across at least this many listings. */
  digitalMinListings: 50,
  digitalWeight: 0.15,

  /** "Few sales for its size": fewer sales per active listing than this... */
  lowSalesMaxPerListing: 0.1,
  /** ...across at least this many listings. */
  lowSalesMinListings: 100,
  lowSalesWeight: 0.2,
} as const;
