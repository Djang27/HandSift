import type { Verdict } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import {
  confusion,
  disclosedOnly,
  flaggedAtScore,
  precision,
  recall,
  type Label,
  type LabeledVerdict,
} from "./metrics";

function item(label: Label, level: Verdict["level"], score: number): LabeledVerdict {
  return { label, verdict: { listingId: "1", level, score, reasons: [], checkedAt: 0 } };
}

const ITEMS = [
  item("ai", "disclosed_ai", 1), // caught by disclosure
  item("ai", "unclear", 0.5), // caught only at a low threshold
  item("ai", "clean", 0), // missed
  item("human", "unclear", 0.45), // wrongly flagged at a low threshold
  item("human", "clean", 0),
];

describe("metrics", () => {
  it("counts the confusion matrix for disclosures only", () => {
    expect(confusion(ITEMS, disclosedOnly)).toEqual({ tp: 1, fp: 0, fn: 2, tn: 2 });
  });

  it("counts the confusion matrix at a score threshold", () => {
    expect(confusion(ITEMS, flaggedAtScore(0.6))).toEqual({ tp: 1, fp: 0, fn: 2, tn: 2 });
    expect(confusion(ITEMS, flaggedAtScore(0.4))).toEqual({ tp: 2, fp: 1, fn: 1, tn: 1 });
  });

  it("computes precision and recall", () => {
    const c = confusion(ITEMS, flaggedAtScore(0.4));
    expect(precision(c)).toBeCloseTo(2 / 3);
    expect(recall(c)).toBeCloseTo(2 / 3);
  });

  it("returns null instead of dividing by zero", () => {
    expect(precision({ tp: 0, fp: 0, fn: 3, tn: 1 })).toBeNull();
    expect(recall({ tp: 0, fp: 2, fn: 0, tn: 1 })).toBeNull();
  });
});
