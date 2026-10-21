import { createD1Cache } from "./cache/d1Cache";
import { createLayeredCache } from "./cache/layeredCache";
import type { FetchBatch } from "./etsy/coalesce";
import { logEvent } from "./log";
import type { RouterDeps } from "./router";

/**
 * Builds the request's dependencies from bindings. Cache lookups go D1 -> Etsy.
 *
 * Budget: Cloudflare's free plan allows 50 subrequests (fetch, Cache API, and D1 calls)
 * per request. A 100-listing request uses about 4: one D1 read, one or two Etsy calls,
 * one D1 batch write. The per-listing edge cache (one Cache API call per listing) was
 * dropped for this reason; see CLAUDE.md, Scaling plan.
 */
export function createRouterDeps(
  env: Env,
  ctx: ExecutionContext,
  fetchListings: FetchBatch,
): RouterDeps {
  return {
    allowedExtensionIds: env.ALLOWED_EXTENSION_IDS,
    rateLimiter: env.RATE_LIMITER,
    listings: {
      cache: createLayeredCache([{ name: "d1", cache: createD1Cache(env.DB) }], (hits) => {
        logEvent("cache_lookup", hits);
      }),
      fetchListings,
      now: Date.now,
      waitUntil: (promise) => {
        ctx.waitUntil(promise);
      },
    },
  };
}
