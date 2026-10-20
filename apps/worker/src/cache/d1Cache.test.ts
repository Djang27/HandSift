import { D1_CACHE_TTL_MS, MISSING_LISTING_CACHE_TTL_MS } from "@handsift/shared";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { CacheEntry } from "./cache";
import { createD1Cache } from "./d1Cache";

const T0 = 1_800_000_000_000;
let nextId = 1;
const uniqueId = () => String(5_000_000_000 + nextId++);

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
      shop: {
        shopId: "9",
        createdAt: 0,
        activeListingCount: 1,
        digitalListingCount: 0,
        salesCount: 1,
      },
      fetchedAt,
    },
  };
}

describe("d1Cache", () => {
  it("round-trips listings (with shops) and missing markers", async () => {
    const cache = createD1Cache(env.DB, () => T0);
    const [a, b, c] = [uniqueId(), uniqueId(), uniqueId()];
    const missing: CacheEntry = { kind: "missing", listingId: b, fetchedAt: T0 };
    await cache.put([listingEntry(a), missing]);

    const found = await cache.get([a, b, c]);
    expect(found.get(a)).toEqual(listingEntry(a));
    expect(found.get(b)).toEqual(missing);
    expect(found.has(c)).toBe(false);
  });

  it("stops serving entries once they expire", async () => {
    let now = T0;
    const cache = createD1Cache(env.DB, () => now);
    const [a, b] = [uniqueId(), uniqueId()];
    await cache.put([listingEntry(a), { kind: "missing", listingId: b, fetchedAt: T0 }]);

    now = T0 + MISSING_LISTING_CACHE_TTL_MS;
    expect([...(await cache.get([a, b])).keys()]).toEqual([a]);
    now = T0 + D1_CACHE_TTL_MS;
    expect((await cache.get([a])).size).toBe(0);
  });

  it("doesn't write entries that are already stale", async () => {
    const cache = createD1Cache(env.DB, () => T0 + D1_CACHE_TTL_MS + 1);
    const a = uniqueId();
    await cache.put([listingEntry(a)]);
    const row = await env.DB.prepare("SELECT 1 FROM listings_cache WHERE listing_id = ?1")
      .bind(a)
      .first();
    expect(row).toBeNull();
  });

  it("overwrites an existing row with newer data", async () => {
    const cache = createD1Cache(env.DB, () => T0 + 10);
    const a = uniqueId();
    await cache.put([listingEntry(a, T0)]);
    await cache.put([listingEntry(a, T0 + 5)]);
    const entry = (await cache.get([a])).get(a);
    expect(entry?.kind === "listing" && entry.result.fetchedAt).toBe(T0 + 5);
  });

  it("handles more IDs than D1's 100-parameter limit", async () => {
    const cache = createD1Cache(env.DB, () => T0);
    const ids = Array.from({ length: 150 }, uniqueId);
    await cache.put(ids.map((id) => listingEntry(id)));
    expect((await cache.get(ids)).size).toBe(150);
  });

  it("ignores corrupt rows", async () => {
    const a = uniqueId();
    await env.DB.prepare("INSERT INTO listings_cache VALUES (?1, ?2, ?3, ?4)")
      .bind(a, "{not json", T0, T0 + D1_CACHE_TTL_MS)
      .run();
    expect((await createD1Cache(env.DB, () => T0).get([a])).size).toBe(0);
  });

  it("treats IDs strictly as data (bound parameters)", async () => {
    const cache = createD1Cache(env.DB, () => T0);
    await cache.put([listingEntry(uniqueId())]);
    expect((await cache.get(["1) OR 1=1; DROP TABLE listings_cache; --"])).size).toBe(0);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM listings_cache").first<{
      n: number;
    }>();
    expect(count?.n).toBeGreaterThan(0);
  });

  it("acts as a cache miss, without throwing, when D1 fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
      batch: () => Promise.reject(new Error("D1 unavailable")),
    } as unknown as D1Database;
    const cache = createD1Cache(broken, () => T0);
    await expect(cache.get(["1"])).resolves.toEqual(new Map());
    await expect(cache.put([listingEntry("1")])).resolves.toBeUndefined();
  });
});
