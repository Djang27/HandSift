import { ListingIdSchema } from "@handsift/shared";
import type { SiteAdapter } from "@handsift/shared/interfaces";
import { BADGE_HOST_TAG, LISTING_CARD, LISTING_ID_ATTRIBUTE } from "./selectors";

export const etsyAdapter: SiteAdapter = {
  id: "etsy",

  matches(url) {
    return url.hostname === "etsy.com" || url.hostname.endsWith(".etsy.com");
  },

  findItemElements(root) {
    return [...root.querySelectorAll(LISTING_CARD)];
  },

  extractItemId(el) {
    const id = el.getAttribute(LISTING_ID_ATTRIBUTE);
    return id !== null && ListingIdSchema.safeParse(id).success ? id : null;
  },

  /** Returns the card's badge host (creating it once) with an open shadow root. */
  mountBadge(el) {
    for (const child of el.children) {
      if (child.localName === BADGE_HOST_TAG && child instanceof HTMLElement) return child;
    }
    const host = el.ownerDocument.createElement(BADGE_HOST_TAG);
    host.attachShadow({ mode: "open" });
    el.prepend(host);
    return host;
  },
};
