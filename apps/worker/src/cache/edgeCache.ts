import { EDGE_CACHE_TTL_MS, MISSING_LISTING_CACHE_TTL_MS } from "@handsift/shared";
import { logError } from "../log";
import {
  CacheEntrySchema,
  cacheEntryFetchedAt,
  cacheEntryId,
  type CacheEntry,
  type ListingCache,
} from "./cache";

// Cloudflare Cache API implementation. Per data center, and only functional on custom
// domains (a no-op on *.workers.dev), which is why Phase 10 adds a global D1 layer.

const KEY_PREFIX = "https://cache.handsift.internal/v1/listing/";

function ttlMs(entry: CacheEntry): number {
  return entry.kind === "listing" ? EDGE_CACHE_TTL_MS : MISSING_LISTING_CACHE_TTL_MS;
}

function keyFor(id: string): Request {
  return new Request(`${KEY_PREFIX}${id}`);
}

export function createEdgeCache(cache: Cache, now: () => number = Date.now): ListingCache {
  return {
    async get(ids) {
      const found = new Map<string, CacheEntry>();
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await cache.match(keyFor(id));
            if (!res) return;
            const entry = CacheEntrySchema.parse(await res.json());
            // Belt and braces: never serve past our own TTL, whatever the cache does.
            if (cacheEntryFetchedAt(entry) + ttlMs(entry) > now()) found.set(id, entry);
          } catch (error) {
            logError("edge_cache_read_failed", error);
          }
        }),
      );
      return found;
    },

    async put(entries) {
      await Promise.all(
        entries.map(async (entry) => {
          const remainingMs = cacheEntryFetchedAt(entry) + ttlMs(entry) - now();
          if (remainingMs <= 0) return;
          const res = new Response(JSON.stringify(entry), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": `max-age=${String(Math.floor(remainingMs / 1000))}`,
            },
          });
          try {
            await cache.put(keyFor(cacheEntryId(entry)), res);
          } catch (error) {
            logError("edge_cache_write_failed", error);
          }
        }),
      );
    },
  };
}
