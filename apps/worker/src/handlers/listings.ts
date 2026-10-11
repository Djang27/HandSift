import { VERSION_HEADER, type V1ListingResult, type V1ListingsResponse } from "@handsift/shared";
import type { CacheEntry, ListingCache } from "../cache/cache";
import { EtsyRateLimitedError, type EtsyBatchResult } from "../etsy/etsyClient";
import { toListingData, toShopData } from "../etsy/normalize";
import { logError, logEvent } from "../log";
import { parseListingsQuery } from "../middleware/validate";
import { errorResponse } from "../responses";

export interface ListingsDeps {
  cache: ListingCache;
  fetchListings: (ids: readonly string[]) => Promise<EtsyBatchResult>;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
}

const VERSION_PATTERN = /^[\w.-]{1,32}$/;

/** GET /v1/listings?ids=... : cache first, then one Etsy batch call for the rest. */
export async function handleListings(request: Request, deps: ListingsDeps): Promise<Response> {
  const startedAt = deps.now();
  const parsed = parseListingsQuery(new URL(request.url));
  if (!parsed.ok) return errorResponse("invalid_request", parsed.message);
  const ids = parsed.value;

  const entries = await deps.cache.get(ids);
  const cacheHits = entries.size;
  const toFetch = ids.filter((id) => !entries.has(id));
  const unavailable = new Set<string>();
  let etsy: EtsyBatchResult | null = null;
  let outcome = "ok";

  if (toFetch.length > 0) {
    try {
      etsy = await deps.fetchListings(toFetch);
      const fresh = toCacheEntries(etsy, deps.now());
      for (const entry of fresh) entries.set(entryKey(entry), entry);
      if (fresh.length > 0) deps.waitUntil(deps.cache.put(fresh));
    } catch (error) {
      outcome = error instanceof EtsyRateLimitedError ? "etsy_rate_limited" : "etsy_error";
      logError(outcome, error);
    }
    for (const id of toFetch) if (!entries.has(id)) unavailable.add(id);
  }

  const body: V1ListingsResponse = { results: [], missing: [], unavailable: [...unavailable] };
  for (const id of ids) {
    const entry = entries.get(id);
    if (entry?.kind === "listing") body.results.push(entry.result);
    if (entry?.kind === "missing") body.missing.push(id);
  }

  const version = request.headers.get(VERSION_HEADER);
  logEvent("listings_request", {
    outcome,
    ids: ids.length,
    cacheHits,
    etsyCalls: etsy?.etsyCalls ?? 0,
    etsyRemainingToday: etsy?.remainingToday ?? null,
    missing: body.missing.length,
    invalid: etsy?.invalid.length ?? 0,
    unavailable: body.unavailable.length,
    extensionVersion: version !== null && VERSION_PATTERN.test(version) ? version : null,
    latencyMs: deps.now() - startedAt,
  });
  return Response.json(body);
}

function toCacheEntries(etsy: EtsyBatchResult, fetchedAt: number): CacheEntry[] {
  const listings: CacheEntry[] = etsy.listings.map((raw) => {
    const result: V1ListingResult = {
      listing: toListingData(raw),
      shop: raw.shop ? toShopData(raw.shop) : null,
      fetchedAt,
    };
    return { kind: "listing", result };
  });
  const missing: CacheEntry[] = etsy.missing.map((listingId) => ({
    kind: "missing",
    listingId,
    fetchedAt,
  }));
  return [...listings, ...missing];
}

function entryKey(entry: CacheEntry): string {
  return entry.kind === "listing" ? entry.result.listing.listingId : entry.listingId;
}
