import {
  MAX_IDS_PER_REQUEST,
  V1_LISTINGS_PATH,
  V1ListingsResponseSchema,
  VERSION_HEADER,
  WORKER_BACKOFF_MS,
  WORKER_CONCURRENCY,
} from "@handsift/shared";
import type { ItemSource, ListingsLookup } from "@handsift/shared/interfaces";
import pLimit from "p-limit";

export interface WorkerSourceOptions {
  /** The Worker's base URL (build-time WXT_WORKER_URL). */
  baseUrl: string;
  /** Extension version, sent so Worker logs show which versions are live. */
  version: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * ItemSource backed by the HandSift Worker. Splits IDs into Worker-sized batches, limits
 * concurrency, validates responses, and never rejects: any failure comes back as
 * "unavailable". After a failure, or when the Worker reports unavailable listings (Etsy
 * trouble), it pauses requests for WORKER_BACKOFF_MS.
 */
export function createWorkerSource(options: WorkerSourceOptions): ItemSource {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const limit = pLimit(WORKER_CONCURRENCY);
  let backoffUntil = 0;

  function backOff(): void {
    backoffUntil = now() + WORKER_BACKOFF_MS;
  }

  async function fetchBatch(ids: readonly string[]): Promise<ListingsLookup> {
    if (now() < backoffUntil) return allUnavailable(ids);
    try {
      const url = new URL(V1_LISTINGS_PATH, options.baseUrl);
      url.searchParams.set("ids", ids.join(","));
      const res = await doFetch(url, { headers: { [VERSION_HEADER]: options.version } });
      if (!res.ok) {
        console.warn(`[HandSift] Worker returned HTTP ${String(res.status)}`);
        backOff();
        return allUnavailable(ids);
      }
      const parsed = V1ListingsResponseSchema.safeParse(await res.json());
      if (!parsed.success) {
        console.warn("[HandSift] Unexpected Worker response", parsed.error.issues);
        backOff();
        return allUnavailable(ids);
      }
      if (parsed.data.unavailable.length > 0) backOff();
      return parsed.data;
    } catch (error) {
      console.warn("[HandSift] Worker request failed", error);
      backOff();
      return allUnavailable(ids);
    }
  }

  return {
    async getListings(ids) {
      const unique = [...new Set(ids)];
      const batches: string[][] = [];
      for (let i = 0; i < unique.length; i += MAX_IDS_PER_REQUEST) {
        batches.push(unique.slice(i, i + MAX_IDS_PER_REQUEST));
      }
      const parts = await Promise.all(batches.map((batch) => limit(() => fetchBatch(batch))));
      return {
        results: parts.flatMap((p) => p.results),
        missing: parts.flatMap((p) => p.missing),
        unavailable: parts.flatMap((p) => p.unavailable),
      };
    },
  };
}

function allUnavailable(ids: readonly string[]): ListingsLookup {
  return { results: [], missing: [], unavailable: [...ids] };
}
