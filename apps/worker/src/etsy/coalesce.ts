import type { EtsyListing } from "@handsift/shared";
import type { EtsyBatchResult } from "./etsyClient";

export type FetchBatch = (ids: readonly string[]) => Promise<EtsyBatchResult>;

type Outcome =
  { kind: "listing"; listing: EtsyListing } | { kind: "missing" } | { kind: "invalid" };

function outcomeFor(id: string, result: EtsyBatchResult): Outcome {
  const listing = result.listings.find((l) => String(l.listing_id) === id);
  if (listing) return { kind: "listing", listing };
  return result.missing.includes(id) ? { kind: "missing" } : { kind: "invalid" };
}

/**
 * Concurrent lookups for the same uncached listing share one Etsy call: IDs already being
 * fetched (by another request in this Worker instance) are awaited, and only the rest are
 * fetched. Nothing is kept once a fetch settles; caching is the cache layers' job. If a
 * fetch this call depends on fails, this call fails too (the handler then serves what's
 * cached and marks the rest unavailable).
 */
export function coalesce(fetchBatch: FetchBatch): FetchBatch {
  const inFlight = new Map<string, Promise<Outcome>>();

  return async (ids) => {
    const waiting = ids.flatMap((id) => {
      const pending = inFlight.get(id);
      return pending ? [{ id, pending }] : [];
    });
    const own = ids.filter((id) => !inFlight.has(id));

    let ownFetch: Promise<EtsyBatchResult> | null = null;
    if (own.length > 0) {
      ownFetch = fetchBatch(own);
      for (const id of own) {
        const outcome = ownFetch.then((result) => outcomeFor(id, result));
        inFlight.set(id, outcome);
        outcome
          .finally(() => {
            if (inFlight.get(id) === outcome) inFlight.delete(id);
          })
          .catch(() => undefined); // failures surface to the callers that await them
      }
    }

    const [ownResult, shared] = await Promise.all([
      ownFetch,
      Promise.all(waiting.map(async ({ id, pending }) => ({ id, outcome: await pending }))),
    ]);

    const result: EtsyBatchResult = {
      listings: [...(ownResult?.listings ?? [])],
      missing: [...(ownResult?.missing ?? [])],
      invalid: [...(ownResult?.invalid ?? [])],
      etsyCalls: ownResult?.etsyCalls ?? 0,
      remainingToday: ownResult?.remainingToday ?? null,
    };
    for (const { id, outcome } of shared) {
      if (outcome.kind === "listing") result.listings.push(outcome.listing);
      else if (outcome.kind === "missing") result.missing.push(id);
      else result.invalid.push(id);
    }
    return result;
  };
}
