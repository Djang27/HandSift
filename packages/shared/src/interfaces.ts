import type { ListingData } from "./schemas/listing";
import type { ShopData } from "./schemas/shop";
import type { Signal } from "./schemas/signal";
import type { Verdict } from "./schemas/verdict";

export type SiteId = "etsy";

// A site the extension runs on. Etsy now, Pinterest/Google Images later.
export interface SiteAdapter {
  id: SiteId;
  matches(url: URL): boolean;
  findItemElements(root: ParentNode): Element[];
  extractItemId(el: Element): string | null;
  /** Returns a Shadow DOM host. */
  mountBadge(el: Element): HTMLElement;
}

// Where item data comes from (Etsy API via Worker now; could be another source later).
export interface ItemSource {
  getListings(ids: string[]): Promise<ListingData[]>;
  getShop(shopId: string): Promise<ShopData>;
}

export interface SignalInput {
  listing: ListingData;
  shop?: ShopData;
}

// One detection signal. Adding a signal = one new file + register it. Scoring never changes.
export interface SignalModule {
  id: string;
  defaultWeight: number;
  evaluate(input: SignalInput): Signal;
}

// Persistence for verdicts and shop data.
export interface VerdictStore {
  get(ids: string[]): Promise<Map<string, Verdict>>;
  put(verdicts: Verdict[]): Promise<void>;
  clear(): Promise<void>;
}
