import { D1_CACHE_TTL_MS, MISSING_LISTING_CACHE_TTL_MS } from "@handsift/shared";
import { z } from "zod";
import { logError } from "../log";
import {
  CacheEntrySchema,
  cacheEntryFetchedAt,
  cacheEntryId,
  type CacheEntry,
  type ListingCache,
} from "./cache";

// Shared, global cache in Cloudflare D1 (table from migrations/0001). Every value is a
// bound parameter; only the count of "?" placeholders is generated.

/** D1 allows at most 100 bound parameters per query. */
const MAX_PARAMS = 100;

const UPSERT = `INSERT INTO listings_cache (listing_id, data, fetched_at, expires_at)
VALUES (?1, ?2, ?3, ?4)
ON CONFLICT (listing_id) DO UPDATE SET
  data = excluded.data, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`;

const RowSchema = z.object({ data: z.string(), expires_at: z.number() });

function ttlMs(entry: CacheEntry): number {
  return entry.kind === "listing" ? D1_CACHE_TTL_MS : MISSING_LISTING_CACHE_TTL_MS;
}

function parseEntry(text: string): CacheEntry | null {
  try {
    const parsed = CacheEntrySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function createD1Cache(db: D1Database, now: () => number = Date.now): ListingCache {
  return {
    async get(ids) {
      const found = new Map<string, CacheEntry>();
      try {
        for (const chunk of chunks(ids, MAX_PARAMS)) {
          const placeholders = chunk.map((_, i) => `?${String(i + 1)}`).join(", ");
          const { results } = await db
            .prepare(
              `SELECT data, expires_at FROM listings_cache WHERE listing_id IN (${placeholders})`,
            )
            .bind(...chunk)
            .all();
          const t = now();
          for (const raw of results) {
            const row = RowSchema.safeParse(raw);
            if (!row.success || row.data.expires_at <= t) continue;
            const entry = parseEntry(row.data.data);
            if (entry) found.set(cacheEntryId(entry), entry);
          }
        }
      } catch (error) {
        logError("d1_cache_read_failed", error);
      }
      return found;
    },

    async put(entries) {
      const t = now();
      const fresh = entries.filter((e) => cacheEntryFetchedAt(e) + ttlMs(e) > t);
      if (fresh.length === 0) return;
      try {
        await db.batch(
          fresh.map((e) => {
            const fetchedAt = cacheEntryFetchedAt(e);
            return db
              .prepare(UPSERT)
              .bind(cacheEntryId(e), JSON.stringify(e), fetchedAt, fetchedAt + ttlMs(e));
          }),
        );
      } catch (error) {
        logError("d1_cache_write_failed", error);
      }
    },
  };
}
