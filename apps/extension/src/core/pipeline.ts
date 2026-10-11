import { VERDICT_TTL_MS, type V1ListingResult, type Verdict } from "@handsift/shared";
import type {
  ItemSource,
  ListingsLookup,
  SignalInput,
  SignalModule,
  VerdictStore,
} from "@handsift/shared/interfaces";
import type { Scorer } from "./scoring/scorer";

export interface PipelineDeps {
  store: VerdictStore;
  source: ItemSource;
  signals: readonly SignalModule[];
  score: Scorer;
  now: () => number;
}

export interface CheckResult {
  /** In request order. Listings that don't exist or couldn't be checked have no verdict. */
  verdicts: Verdict[];
  unavailable: string[];
}

/**
 * Verdicts for the given listings: fresh stored verdicts first, then one source lookup for
 * the rest, evaluated against every signal, scored, and stored. Never throws on bad data;
 * a listing whose evaluation fails gets an "unclear" verdict.
 */
export async function checkListings(
  ids: readonly string[],
  deps: PipelineDeps,
): Promise<CheckResult> {
  const unique = [...new Set(ids)];
  const now = deps.now();
  const verdicts = new Map(
    [...(await deps.store.get(unique))].filter(([, v]) => isFresh(v.checkedAt, now)),
  );

  const toFetch = unique.filter((id) => !verdicts.has(id));
  const lookup: ListingsLookup =
    toFetch.length > 0
      ? await deps.source.getListings(toFetch)
      : { results: [], missing: [], unavailable: [] };

  const requested = new Set(toFetch);
  const unavailable = new Set(lookup.unavailable.filter((id) => requested.has(id)));
  const created: Verdict[] = [];
  for (const result of lookup.results) {
    const id = result.listing.listingId;
    if (!requested.has(id)) continue;
    if (!isFresh(result.fetchedAt, now)) {
      // Older than Etsy's freshness limit: never show it.
      unavailable.add(id);
      continue;
    }
    created.push(evaluate(result, deps));
  }

  if (created.length > 0) await deps.store.put(created);
  for (const verdict of created) verdicts.set(verdict.listingId, verdict);

  return {
    verdicts: unique.flatMap((id) => verdicts.get(id) ?? []),
    unavailable: [...unavailable],
  };
}

function isFresh(fetchedAt: number, now: number): boolean {
  return fetchedAt <= now && now - fetchedAt < VERDICT_TTL_MS;
}

function evaluate({ listing, shop, fetchedAt }: V1ListingResult, deps: PipelineDeps): Verdict {
  const input: SignalInput = shop ? { listing, shop } : { listing };
  try {
    const signals = deps.signals.map((signal) => signal.evaluate(input));
    return deps.score({ listing, signals, checkedAt: fetchedAt });
  } catch {
    return {
      listingId: listing.listingId,
      level: "unclear",
      score: 0,
      reasons: [],
      checkedAt: fetchedAt,
    };
  }
}
