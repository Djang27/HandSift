import {
  LIKELY_AI_THRESHOLDS,
  type Sensitivity,
  type Verdict,
  type VerdictLevel,
} from "@handsift/shared";

/** Level for an inferred score (no disclosure) at a sensitivity. */
export function levelForScore(
  score: number,
  sensitivity: Sensitivity,
): "clean" | "unclear" | "likely_ai" {
  if (score <= 0) return "clean";
  return score >= LIKELY_AI_THRESHOLDS[sensitivity] ? "likely_ai" : "unclear";
}

/**
 * Level to show for a stored verdict at the user's current sensitivity, so changing the
 * setting never needs a refetch. A disclosure stays a disclosure at every sensitivity.
 */
export function displayLevel(verdict: Verdict, sensitivity: Sensitivity): VerdictLevel {
  if (verdict.level === "disclosed_ai") return "disclosed_ai";
  if (verdict.score <= 0) return verdict.level === "unclear" ? "unclear" : "clean";
  return levelForScore(verdict.score, sensitivity);
}
