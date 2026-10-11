import { EDGE_CACHE_TTL_MS, MISSING_LISTING_CACHE_TTL_MS } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import type { CacheEntry } from "./cache";
import { createEdgeCache } from "./edgeCache";

const T0 = 1_800_000_000_000;

function listingEntry(id: string, fetchedAt = T0): CacheEntry {
  return {
    kind: "listing",
    result: {
      listing: {
        listingId: id,
        shopId: "9",
        title: "t",
        description: "d",
        tags: [],
        materials: [],
        whoMade: "i_did",
        listingType: "physical",
        hasProductionPartner: false,
      },
      shop: null,
      fetchedAt,
    },
  };
}

async function freshCache(): Promise<Cache> {
  return caches.open(`test-${crypto.randomUUID()}`);
}

describe("edgeCache", () => {
  it("round-trips listing and missing entries", async () => {
    const cache = createEdgeCache(await freshCache(), () => T0);
    const missing: CacheEntry = { kind: "missing", listingId: "2", fetchedAt: T0 };
    await cache.put([listingEntry("1"), missing]);

    const found = await cache.get(["1", "2", "3"]);
    expect(found.get("1")).toEqual(listingEntry("1"));
    expect(found.get("2")).toEqual(missing);
    expect(found.has("3")).toBe(false);
  });

  it("stops serving listings after EDGE_CACHE_TTL_MS", async () => {
    let now = T0;
    const cache = createEdgeCache(await freshCache(), () => now);
    await cache.put([listingEntry("1")]);

    now = T0 + EDGE_CACHE_TTL_MS - 1;
    expect((await cache.get(["1"])).has("1")).toBe(true);
    now = T0 + EDGE_CACHE_TTL_MS;
    expect((await cache.get(["1"])).has("1")).toBe(false);
  });

  it("stops serving missing markers after MISSING_LISTING_CACHE_TTL_MS", async () => {
    let now = T0;
    const cache = createEdgeCache(await freshCache(), () => now);
    await cache.put([{ kind: "missing", listingId: "2", fetchedAt: T0 }]);

    now = T0 + MISSING_LISTING_CACHE_TTL_MS;
    expect((await cache.get(["2"])).has("2")).toBe(false);
  });

  it("doesn't store entries that are already stale", async () => {
    const raw = await freshCache();
    const cache = createEdgeCache(raw, () => T0 + EDGE_CACHE_TTL_MS + 1);
    await cache.put([listingEntry("1")]);
    expect(await raw.match("https://cache.handsift.internal/v1/listing/1")).toBeUndefined();
  });

  it("treats corrupt entries as misses", async () => {
    const raw = await freshCache();
    await raw.put(
      "https://cache.handsift.internal/v1/listing/1",
      new Response('{"kind":"nonsense"}', { headers: { "Cache-Control": "max-age=60" } }),
    );
    const cache = createEdgeCache(raw, () => T0);
    expect((await cache.get(["1"])).size).toBe(0);
  });
});
