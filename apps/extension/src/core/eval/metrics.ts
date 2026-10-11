import type { Verdict } from "@handsift/shared";

// Accuracy metrics for the eval script. Pure; not used by the extension at runtime.

export type Label = "ai" | "human";

export interface LabeledVerdict {
  label: Label;
  verdict: Verdict;
}

export interface Confusion {
  /** Flagged and labeled AI. */
  tp: number;
  /** Flagged but labeled human: the costly mistake (a real artist wrongly flagged). */
  fp: number;
  /** Labeled AI but not flagged. */
  fn: number;
  /** Not flagged and labeled human. */
  tn: number;
}

export type FlagRule = (verdict: Verdict) => boolean;

/** Flag only seller disclosures. */
export const disclosedOnly: FlagRule = (v) => v.level === "disclosed_ai";

/** Flag disclosures, plus inferred scores at or above `threshold`. */
export function flaggedAtScore(threshold: number): FlagRule {
  return (v) => v.level === "disclosed_ai" || v.score >= threshold;
}

export function confusion(items: readonly LabeledVerdict[], isFlagged: FlagRule): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { label, verdict } of items) {
    const flagged = isFlagged(verdict);
    if (flagged && label === "ai") c.tp++;
    else if (flagged) c.fp++;
    else if (label === "ai") c.fn++;
    else c.tn++;
  }
  return c;
}

/** Of the flagged listings, the share that really are AI. Null when nothing is flagged. */
export function precision({ tp, fp }: Confusion): number | null {
  return tp + fp === 0 ? null : tp / (tp + fp);
}

/** Of the AI listings, the share that get flagged. Null when there are no AI labels. */
export function recall({ tp, fn }: Confusion): number | null {
  return tp + fn === 0 ? null : tp / (tp + fn);
}
