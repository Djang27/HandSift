// Every Etsy DOM selector lives here and nowhere else. Verified against saved search pages
// (fixtures/real/search-pages, Oct 2026). Shop pages are not verified yet.

/** Root element of a search-result listing card. Inner elements also carry data-listing-id,
 * so the card marker attribute is required too. */
export const LISTING_CARD = "[data-listing-card-v2][data-listing-id]";

/** Attribute on the card root holding the listing ID. */
export const LISTING_ID_ATTRIBUTE = "data-listing-id";

/** Tag of the element HandSift adds to a card to host its badge (Shadow DOM). */
export const BADGE_HOST_TAG = "handsift-badge";
