import { V1ListingsResponseSchema, type V1ListingsResponse } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import batchFixture from "../../../../fixtures/synthetic/etsy/listings-batch.json";
import type { CacheEntry, ListingCache } from "../cache/cache";
import {
  EtsyRateLimitedError,
  EtsyUpstreamError,
  fetchListingsBatch,
  type EtsyBatchResult,
} from "../etsy/etsyClient";
import { handleListings, type ListingsDeps } from "./listings";

const NOW = 1_800_000_000_000;
const [A, B, C] = batchFixture.results.map((l) => String(l.listing_id));
if (!A || !B || !C) throw new Error("fixture too small");

/** Real etsyClient parsing, fed from the synthetic fixture instead of the network. */
function etsyReturning(missing: string[] = []) {
  return vi.fn((ids: readonly string[]): Promise<EtsyBatchResult> => {
    const found = ids.filter((id) => !missing.includes(id));
    const results = batchFixture.results.filter((l) => found.includes(String(l.listing_id)));
    const responses = [Response.json({ count: results.length, results })];
    if (missing.length > 0) {
      responses.unshift(
        Response.json({ error: `Missing listing_ids: ${missing.join(",")}.` }, { status: 404 }),
      );
    }
    const fetchFn = vi.fn<typeof fetch>();
    for (const res of responses) fetchFn.mockResolvedValueOnce(res);
    return fetchListingsBatch(ids, { apiKey: "k:s", fetch: fetchFn });
  });
}

function memoryCache(
  initial: CacheEntry[] = [],
): ListingCache & { store: Map<string, CacheEntry> } {
  const store = new Map<string, CacheEntry>();
  for (const e of initial)
    store.set(e.kind === "listing" ? e.result.listing.listingId : e.listingId, e);
  return {
    store,
    get: (ids) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const e = store.get(id);
            return e ? [[id, e] as const] : [];
          }),
        ),
      ),
    put: (entries) => {
      for (const e of entries)
        store.set(e.kind === "listing" ? e.result.listing.listingId : e.listingId, e);
      return Promise.resolve();
    },
  };
}

function deps(
  overrides: Partial<ListingsDeps> = {},
): ListingsDeps & { pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  return {
    cache: memoryCache(),
    fetchListings: etsyReturning(),
    now: () => NOW,
    waitUntil: (p) => pending.push(p),
    pending,
    ...overrides,
  };
}

async function call(query: string, d: ListingsDeps, headers: Record<string, string> = {}) {
  const res = await handleListings(
    new Request(`https://w.test/v1/listings${query}`, { headers }),
    d,
  );
  return { res, body: res.ok ? V1ListingsResponseSchema.parse(await res.json()) : null };
}

const ids = (body: V1ListingsResponse | null) => body?.results.map((r) => r.listing.listingId);

describe("handleListings", () => {
  it("fetches uncached listings from Etsy, in request order, and caches them", async () => {
    const d = deps();
    const { res, body } = await call(`?ids=${C},${A}`, d);

    expect(res.status).toBe(200);
    expect(ids(body)).toEqual([C, A]);
    expect(body?.results[0]?.shop).not.toBeNull();
    expect(body?.results[0]?.fetchedAt).toBe(NOW);
    expect(body).toMatchObject({ missing: [], unavailable: [] });

    await Promise.all(d.pending);
    const cache = d.cache as ReturnType<typeof memoryCache>;
    expect([...cache.store.keys()].sort()).toEqual([A, C].sort());
  });

  it("serves cache hits without calling Etsy", async () => {
    const warm = deps();
    await call(`?ids=${A},${B}`, warm);
    await Promise.all(warm.pending);

    const d = deps({ cache: warm.cache });
    const { body } = await call(`?ids=${A},${B}`, d);
    expect(ids(body)).toEqual([A, B]);
    expect(d.fetchListings).not.toHaveBeenCalled();
  });

  it("only asks Etsy for the IDs it doesn't have", async () => {
    const warm = deps();
    await call(`?ids=${A}`, warm);
    await Promise.all(warm.pending);

    const d = deps({ cache: warm.cache });
    await call(`?ids=${A},${B}`, d);
    expect(d.fetchListings).toHaveBeenCalledWith([B]);
  });

  it("reports and caches IDs Etsy says don't exist", async () => {
    const d = deps({ fetchListings: etsyReturning(["42"]) });
    const { body } = await call(`?ids=${A},42`, d);
    expect(ids(body)).toEqual([A]);
    expect(body?.missing).toEqual(["42"]);

    await Promise.all(d.pending);
    expect((d.cache as ReturnType<typeof memoryCache>).store.get("42")?.kind).toBe("missing");
  });

  it.each([
    ["rate limited", new EtsyRateLimitedError("429")],
    ["erroring", new EtsyUpstreamError("500")],
  ])("returns cached results and marks the rest unavailable when Etsy is %s", async (_, error) => {
    const warm = deps();
    await call(`?ids=${A}`, warm);
    await Promise.all(warm.pending);

    const d = deps({ cache: warm.cache, fetchListings: vi.fn().mockRejectedValue(error) });
    const { res, body } = await call(`?ids=${A},${B}`, d);
    expect(res.status).toBe(200);
    expect(ids(body)).toEqual([A]);
    expect(body?.unavailable).toEqual([B]);
  });

  it("marks listings with invalid Etsy data unavailable, never guessing", async () => {
    const fetchListings = vi.fn().mockResolvedValue({
      listings: [],
      missing: [],
      invalid: [A],
      etsyCalls: 1,
      remainingToday: null,
    } satisfies EtsyBatchResult);
    const { body } = await call(`?ids=${A}`, deps({ fetchListings }));
    expect(body).toMatchObject({ results: [], missing: [], unavailable: [A] });
  });

  it("rejects invalid input before touching the cache or Etsy", async () => {
    const cache = memoryCache();
    const get = vi.spyOn(cache, "get");
    const d = deps({ cache });
    const { res } = await call("?ids=1;DROP", d);
    expect(res.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
    expect(d.fetchListings).not.toHaveBeenCalled();
  });

  it("logs structured metrics with the extension version but never the client IP", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await call(`?ids=${A}`, deps(), {
      "CF-Connecting-IP": "203.0.113.7",
      "X-HandSift-Version": "0.1.0",
    });
    const line = log.mock.calls
      .map((args) => String(args[0]))
      .find((l) => l.includes("listings_request"));
    log.mockRestore();

    expect(line).toBeDefined();
    expect(line).not.toContain("203.0.113.7");
    expect(JSON.parse(line ?? "{}")).toMatchObject({
      ids: 1,
      etsyCalls: 1,
      extensionVersion: "0.1.0",
    });
  });
});
