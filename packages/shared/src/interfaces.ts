import type { V1ListingsResponse } from "./api";
import type { ListingData } from "./schemas/listing";
import type { ShopData } from "./schemas/shop";
import type { Signal, SignalKind } from "./schemas/signal";
import type { Verdict } from "./schemas/verdict";

export type SiteId = "etsy";

/** How a flagged item is shown on the page. */
export type ItemDisplay = "visible" | "blurred" | "hidden";

// A site the extension runs on. Etsy now, Pinterest/Google Images later.
export interface SiteAdapter {
  id: SiteId;
  matches(url: URL): boolean;
  findItemElements(root: ParentNode): Element[];
  extractItemId(el: Element): string | null;
  /** Returns a Shadow DOM host. */
  mountBadge(el: Element): HTMLElement;
  /** Removes the badge host, if any. */
  unmountBadge(el: Element): void;
  /** Blurs or hides the item (site-specific DOM), or restores it. */
  setItemDisplay(el: Element, display: ItemDisplay): void;
}

/**
 * Listings (each with its shop and fetchedAt), plus IDs that don't exist and IDs that
 * couldn't be checked right now. Same shape as the Worker's v1 response.
 */
export type ListingsLookup = V1ListingsResponse;

// Where item data comes from (Etsy API via Worker now; could be another source later).
// Shops arrive with their listings, so there is no separate getShop.
export interface ItemSource {
  /** Never rejects: failures come back as `unavailable`. */
  getListings(ids: readonly string[]): Promise<ListingsLookup>;
}

export interface SignalInput {
  listing: ListingData;
  shop?: ShopData;
}

// One detection signal. Adding a signal = one new file + register it. Scoring never changes.
export interface SignalModule {
  id: string;
  /** Disclosures (facts) and inferences (guesses) are scored separately. */
  kind: SignalKind;
  defaultWeight: number;
  evaluate(input: SignalInput): Signal;
}

// Persistence for verdicts and shop data.
export interface VerdictStore {
  get(ids: string[]): Promise<Map<string, Verdict>>;
  put(verdicts: Verdict[]): Promise<void>;
  clear(): Promise<void>;
}
