// Every Etsy DOM selector lives here and nowhere else. Verified against saved search and
// shop pages (fixtures/real/search-pages, Oct 2026).

/** Root element of a search-result listing card. Inner elements also carry data-listing-id,
 * so the card marker attribute is required too. */
export const LISTING_CARD = "[data-listing-card-v2][data-listing-id]";

/** Attribute on the card root holding the listing ID. */
export const LISTING_ID_ATTRIBUTE = "data-listing-id";

/** The grid cell holding one card (hidden as a whole, so the grid reflows). Each search
 * card sits alone in its own <li>. Shop-page cards have no <li>: the card is itself the
 * grid item, so the adapter hides the card instead. */
export const GRID_ITEM = "li";

/** The card's listing photo (blurred in blur mode). */
export const CARD_IMAGE = "img";

/** Tag of the element HandSift adds to a card to host its badge (Shadow DOM). */
export const BADGE_HOST_TAG = "handsift-badge";
