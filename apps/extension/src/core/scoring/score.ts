import { DEFAULT_SETTINGS } from "@handsift/shared";
import { levelForScore } from "./levels";
import type { Scorer } from "./scorer";

/**
 * Turns signals into a verdict. Works on any registered signals by their kind, never their
 * names, so adding a signal never changes scoring.
 * - Any disclosure that hits: "disclosed_ai" (the seller said so; a fact).
 * - Otherwise inference weights combine as 1 - (1 - w1)(1 - w2)..., and the level comes from
 *   the default sensitivity (the UI re-derives it for the user's setting).
 * Reasons list disclosures first.
 */
export const score: Scorer = ({ listing, signals, checkedAt }) => {
  const hits = signals.filter((s) => s.hit);
  const disclosures = hits.filter((s) => s.kind === "disclosure");
  const inferences = hits.filter((s) => s.kind === "inference");
  const reasons = [...disclosures, ...inferences].map((s) => s.reason);

  if (disclosures.length > 0) {
    return { listingId: listing.listingId, level: "disclosed_ai", score: 1, reasons, checkedAt };
  }
  const miss = inferences.reduce((product, s) => product * (1 - clamp01(s.weight)), 1);
  const inferred = 1 - miss;
  return {
    listingId: listing.listingId,
    level: levelForScore(inferred, DEFAULT_SETTINGS.sensitivity),
    score: inferred,
    reasons,
    checkedAt,
  };
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
