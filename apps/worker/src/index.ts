import { createEdgeCache } from "./cache/edgeCache";
import { fetchListingsBatch } from "./etsy/etsyClient";
import { route } from "./router";

// Wiring only.
export default {
  fetch(request, env, ctx) {
    return route(request, {
      allowedExtensionIds: env.ALLOWED_EXTENSION_IDS,
      rateLimiter: env.RATE_LIMITER,
      listings: {
        cache: createEdgeCache(caches.default),
        fetchListings: (ids) => fetchListingsBatch(ids, { apiKey: env.ETSY_API_KEY }),
        now: Date.now,
        waitUntil: (promise) => {
          ctx.waitUntil(promise);
        },
      },
    });
  },
} satisfies ExportedHandler<Env>;
