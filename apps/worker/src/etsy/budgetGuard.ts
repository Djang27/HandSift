import { ETSY_DAILY_RESERVE, ETSY_LOW_QUOTA_RECHECK_MS } from "@handsift/shared";
import type { FetchBatch } from "./coalesce";
import { EtsyRateLimitedError } from "./etsyClient";

/** Thrown instead of calling Etsy while the daily quota is below the reserve. */
export class EtsyBudgetError extends Error {
  override name = "EtsyBudgetError";
}

export interface BudgetGuardOptions {
  reserve?: number;
  recheckMs?: number;
  now?: () => number;
}

/**
 * Global Etsy budget guard. Remembers the last `x-remaining-today` this Worker instance saw;
 * once it drops below the reserve (or Etsy answers 429), stops calling Etsy and lets one
 * call through every `recheckMs` to see whether the quota has reset. Callers then serve
 * cached data and mark the rest unavailable. State is per instance: each instance learns
 * from its own calls, so at most one extra call per instance slips through.
 */
export function withBudgetGuard(
  fetchBatch: FetchBatch,
  options: BudgetGuardOptions = {},
): FetchBatch {
  const reserve = options.reserve ?? ETSY_DAILY_RESERVE;
  const recheckMs = options.recheckMs ?? ETSY_LOW_QUOTA_RECHECK_MS;
  const now = options.now ?? Date.now;
  let pausedSince: number | null = null;

  return async (ids) => {
    if (pausedSince !== null && now() - pausedSince < recheckMs) {
      throw new EtsyBudgetError("Etsy daily quota is low; serving cached data only");
    }
    try {
      const result = await fetchBatch(ids);
      const low = result.remainingToday !== null && result.remainingToday < reserve;
      pausedSince = low ? now() : null;
      return result;
    } catch (error) {
      if (error instanceof EtsyRateLimitedError) pausedSince = now();
      throw error;
    }
  };
}
