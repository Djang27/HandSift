import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: ["*://*.etsy.com/*"],
  main() {
    console.info("[HandSift] loaded");
  },
});
