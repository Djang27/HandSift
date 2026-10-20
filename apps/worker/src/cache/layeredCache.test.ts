import { describe, expect, it, vi } from "vitest";
import type { CacheEntry, ListingCache } from "./cache";
import { createLayeredCache, type LayerHits } from "./layeredCache";

const missing = (id: string): CacheEntry => ({ kind: "missing", listingId: id, fetchedAt: 1 });

function memoryLayer(initial: CacheEntry[] = []) {
  const store = new Map(
    initial.map((e) => [e.kind === "missing" ? e.listingId : e.result.listing.listingId, e]),
  );
  const get = vi.fn((ids: readonly string[]) =>
    Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const entry = store.get(id);
          return entry ? [[id, entry] as const] : [];
        }),
      ),
    ),
  );
  const put = vi.fn((entries: readonly CacheEntry[]) => {
    for (const e of entries)
      store.set(e.kind === "missing" ? e.listingId : e.result.listing.listingId, e);
    return Promise.resolve();
  });
  const cache: ListingCache = { get, put };
  return { cache, get, put, store };
}

describe("layeredCache", () => {
  it("asks later layers only for what earlier ones lacked, and reports hits per layer", async () => {
    const edge = memoryLayer([missing("1")]);
    const d1 = memoryLayer([missing("2")]);
    const onLookup = vi.fn<(hits: LayerHits) => void>();
    const cache = createLayeredCache(
      [
        { name: "edge", cache: edge.cache },
        { name: "d1", cache: d1.cache },
      ],
      onLookup,
    );

    const found = await cache.get(["1", "2", "3"]);
    expect([...found.keys()].sort()).toEqual(["1", "2"]);
    expect(d1.get).toHaveBeenCalledWith(["2", "3"]);
    expect(onLookup).toHaveBeenCalledWith({ edge: 1, d1: 1, miss: 1 });
  });

  it("writes entries found in a slower layer back to the faster ones", async () => {
    const edge = memoryLayer();
    const d1 = memoryLayer([missing("2")]);
    const cache = createLayeredCache([
      { name: "edge", cache: edge.cache },
      { name: "d1", cache: d1.cache },
    ]);
    await cache.get(["2"]);
    expect(edge.store.has("2")).toBe(true);
    expect(d1.put).not.toHaveBeenCalled();
  });

  it("stops early when everything is found, and puts go to every layer", async () => {
    const edge = memoryLayer([missing("1")]);
    const d1 = memoryLayer();
    const cache = createLayeredCache([
      { name: "edge", cache: edge.cache },
      { name: "d1", cache: d1.cache },
    ]);
    await cache.get(["1"]);
    expect(d1.get).not.toHaveBeenCalled();

    await cache.put([missing("9")]);
    expect(edge.store.has("9") && d1.store.has("9")).toBe(true);
  });
});
