import { V1ListingResultSchema } from "@handsift/shared";
import { z } from "zod";

// What the Worker caches per listing ID: either the listing (with its shop), or a
// marker that Etsy says it doesn't exist.
export const CacheEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("listing"), result: V1ListingResultSchema }),
  z.object({ kind: z.literal("missing"), listingId: z.string(), fetchedAt: z.number().int() }),
]);

export type CacheEntry = z.infer<typeof CacheEntrySchema>;

export function cacheEntryId(entry: CacheEntry): string {
  return entry.kind === "listing" ? entry.result.listing.listingId : entry.listingId;
}

export function cacheEntryFetchedAt(entry: CacheEntry): number {
  return entry.kind === "listing" ? entry.result.fetchedAt : entry.fetchedAt;
}

/** A cache layer (D1 today; layered so faster layers can be added in front later). */
export interface ListingCache {
  /** Returns fresh entries only; misses are simply absent from the map. */
  get(ids: readonly string[]): Promise<Map<string, CacheEntry>>;
  put(entries: readonly CacheEntry[]): Promise<void>;
}
