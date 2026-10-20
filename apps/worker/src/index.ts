import { createD1Cache } from "./cache/d1Cache";
import { createEdgeCache } from "./cache/edgeCache";
import { createLayeredCache } from "./cache/layeredCache";
import { cleanupExpiredRows } from "./cron/cleanup";
import { coalesce, type FetchBatch } from "./etsy/coalesce";
import { fetchListingsBatch } from "./etsy/etsyClient";
import { logEvent } from "./log";
import { route } from "./router";

// Wiring only. The coalescer lives as long as this Worker instance, so concurrent
// requests handled by it can share Etsy calls.
let fetchListings: FetchBatch | undefined;

export default {
  fetch(request, env, ctx) {
    fetchListings ??= coalesce((ids) => fetchListingsBatch(ids, { apiKey: env.ETSY_API_KEY }));
    return route(request, {
      allowedExtensionIds: env.ALLOWED_EXTENSION_IDS,
      rateLimiter: env.RATE_LIMITER,
      listings: {
        cache: createLayeredCache(
          [
            { name: "edge", cache: createEdgeCache(caches.default) },
            { name: "d1", cache: createD1Cache(env.DB) },
          ],
          (hits) => {
            logEvent("cache_lookup", hits);
          },
        ),
        fetchListings,
        now: Date.now,
        waitUntil: (promise) => {
          ctx.waitUntil(promise);
        },
      },
    });
  },

  async scheduled(controller, env) {
    await cleanupExpiredRows(env.DB, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
