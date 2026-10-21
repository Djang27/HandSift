import { cleanupExpiredRows } from "./cron/cleanup";
import { coalesce, type FetchBatch } from "./etsy/coalesce";
import { fetchListingsBatch } from "./etsy/etsyClient";
import { route } from "./router";
import { createRouterDeps } from "./wiring";

// Wiring only. The coalescer lives as long as this Worker instance, so concurrent
// requests handled by it can share Etsy calls.
let fetchListings: FetchBatch | undefined;

export default {
  fetch(request, env, ctx) {
    fetchListings ??= coalesce((ids) => fetchListingsBatch(ids, { apiKey: env.ETSY_API_KEY }));
    return route(request, createRouterDeps(env, ctx, fetchListings));
  },

  async scheduled(controller, env) {
    await cleanupExpiredRows(env.DB, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
