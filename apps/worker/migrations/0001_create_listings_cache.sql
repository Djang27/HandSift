-- Shared listing cache (Phase 10). One row per listing ID: the normalized listing with its
-- shop attached (exactly what /v1/listings returns), or a marker that Etsy says it doesn't
-- exist. Shops always arrive with their listing, so they live in the same row: no join,
-- and a listing can never be fresh while its shop is stale. Never raw Etsy JSON, never
-- verdicts, never user data. Forward-only: change it with a new numbered migration.
CREATE TABLE listings_cache (
  listing_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,     -- CacheEntry JSON, validated with Zod on read
  fetched_at INTEGER NOT NULL,  -- Unix ms, when the data came from Etsy
  expires_at INTEGER NOT NULL   -- Unix ms; the hourly cron deletes rows past this
);

CREATE INDEX idx_listings_cache_expires ON listings_cache (expires_at);
