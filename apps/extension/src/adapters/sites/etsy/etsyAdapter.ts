import { BLUR_RADIUS_PX, ListingIdSchema } from "@handsift/shared";
import type { SiteAdapter } from "@handsift/shared/interfaces";
import {
  BADGE_HOST_TAG,
  CARD_IMAGE,
  GRID_ITEM,
  LISTING_CARD,
  LISTING_ID_ATTRIBUTE,
} from "./selectors";

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

  unmountBadge(el) {
    for (const child of [...el.children]) {
      if (child.localName === BADGE_HOST_TAG) child.remove();
    }
  },

  /** Hides the card's grid cell or blurs its photo, restoring Etsy's own styles after. */
  setItemDisplay(el, display) {
    const cell = el.closest(GRID_ITEM) ?? el;
    if (cell instanceof HTMLElement)
      setStyle(cell, "display", display === "hidden" ? "none" : null);
    for (const img of el.querySelectorAll(CARD_IMAGE)) {
      if (img instanceof HTMLElement) {
        setStyle(img, "filter", display === "blurred" ? `blur(${String(BLUR_RADIUS_PX)}px)` : null);
      }
    }
  },
};

/**
 * Sets an inline style HandSift owns, remembering the page's original value so `null`
 * restores it exactly.
 */
function setStyle(el: HTMLElement, property: "display" | "filter", value: string | null): void {
  const saved = `data-handsift-original-${property}`;
  if (value === null) {
    if (el.hasAttribute(saved)) {
      el.style[property] = el.getAttribute(saved) ?? "";
      el.removeAttribute(saved);
    }
    return;
  }
  if (!el.hasAttribute(saved)) el.setAttribute(saved, el.style[property]);
  el.style[property] = value;
}
