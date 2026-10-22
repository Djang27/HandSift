import { cleanupExpiredRows } from "./cron/cleanup";
import { withBudgetGuard } from "./etsy/budgetGuard";
import { coalesce, type FetchBatch } from "./etsy/coalesce";
import { fetchListingsBatch } from "./etsy/etsyClient";
import { route } from "./router";
import { createRouterDeps } from "./wiring";

// Wiring only. The coalescer and budget guard live as long as this Worker instance, so
// concurrent requests share Etsy calls and the instance remembers a low daily quota.
let fetchListings: FetchBatch | undefined;

export default {
  fetch(request, env, ctx) {
    fetchListings ??= coalesce(
      withBudgetGuard((ids) => fetchListingsBatch(ids, { apiKey: env.ETSY_API_KEY })),
    );
    return route(request, createRouterDeps(env, ctx, fetchListings));
  },

  async scheduled(controller, env) {
    await cleanupExpiredRows(env.DB, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
