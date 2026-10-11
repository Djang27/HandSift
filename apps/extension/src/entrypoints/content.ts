import { defineContentScript } from "wxt/utils/define-content-script";
import { onGetPageStats, requestCheckListings } from "../adapters/messaging/bus";
import { etsyAdapter } from "../adapters/sites/etsy/etsyAdapter";
import { createSettingsStore } from "../adapters/storage/settings";
import { startContentApp } from "../ui/contentApp";

// Wiring only.
export default defineContentScript({
  matches: ["*://*.etsy.com/*"],
  async main(ctx) {
    if (!etsyAdapter.matches(new URL(location.href))) return;
    const stop = await startContentApp({
      doc: document,
      adapter: etsyAdapter,
      settings: createSettingsStore(),
      checkListings: requestCheckListings,
      onGetPageStats: (handler) => onGetPageStats(handler),
    });
    ctx.onInvalidated(stop);
  },
});
