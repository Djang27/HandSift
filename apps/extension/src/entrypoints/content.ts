import { BATCH_DELAY_MS, MAX_IDS_PER_REQUEST } from "@handsift/shared";
import { defineContentScript } from "wxt/utils/define-content-script";
import { requestCheckListings } from "../adapters/messaging/bus";
import { observeVisibleItems } from "../adapters/page/observeVisibleItems";
import { etsyAdapter } from "../adapters/sites/etsy/etsyAdapter";
import { createBatchQueue } from "../core/batchQueue";

// Wiring only. Phase 6 mounts badges from the verdicts; for now they're logged.
export default defineContentScript({
  matches: ["*://*.etsy.com/*"],
  main(ctx) {
    if (!etsyAdapter.matches(new URL(location.href))) return;

    const queue = createBatchQueue({
      delayMs: BATCH_DELAY_MS,
      maxSize: MAX_IDS_PER_REQUEST,
      flush: async (ids) => {
        const reply = await requestCheckListings(ids);
        if (reply === null) {
          queue.release(ids);
          return;
        }
        queue.release(reply.unavailable);
        console.info(
          `[HandSift] ${String(ids.length)} visible listings checked: ` +
            `${String(reply.verdicts.length)} verdicts, ${String(reply.unavailable.length)} unavailable`,
          reply.verdicts.filter((v) => v.reasons.length > 0),
        );
      },
    });

    const stop = observeVisibleItems(document, etsyAdapter, (id) => {
      queue.add(id);
    });
    ctx.onInvalidated(() => {
      stop();
      queue.stop();
    });
    console.info("[HandSift] loaded");
  },
});
