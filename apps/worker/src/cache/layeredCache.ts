import type { CacheEntry, ListingCache } from "./cache";

export interface CacheLayer {
  name: string;
  cache: ListingCache;
}

/** Hits per layer name, plus `miss` for IDs no layer had. */
export type LayerHits = Record<string, number>;

/**
 * Checks layers in order (fastest first) and only asks later layers for what earlier
 * ones lacked. Entries found in a later layer are written back to the earlier ones; puts
 * go to every layer. Each layer handles its own errors, so a failing layer is just a miss.
 */
export function createLayeredCache(
  layers: readonly CacheLayer[],
  onLookup?: (hits: LayerHits) => void,
): ListingCache {
  return {
    async get(ids) {
      const found = new Map<string, CacheEntry>();
      const hits: LayerHits = {};
      let remaining = [...ids];

      for (const [index, layer] of layers.entries()) {
        if (remaining.length === 0) break;
        const got = await layer.cache.get(remaining);
        hits[layer.name] = got.size;
        if (got.size === 0) continue;
        for (const [id, entry] of got) found.set(id, entry);
        remaining = remaining.filter((id) => !got.has(id));
        const faster = layers.slice(0, index);
        await Promise.all(faster.map((l) => l.cache.put([...got.values()])));
      }

      hits.miss = remaining.length;
      onLookup?.(hits);
      return found;
    },

    async put(entries) {
      await Promise.all(layers.map((l) => l.cache.put(entries)));
    },
  };
}
