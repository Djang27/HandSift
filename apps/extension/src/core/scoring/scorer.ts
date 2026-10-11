import type { ListingData, Signal, Verdict } from "@handsift/shared";

export interface ScoreInput {
  listing: ListingData;
  signals: Signal[];
  /** When the listing data was fetched; becomes Verdict.checkedAt. */
  checkedAt: number;
}

/** Turns one listing's signals into a verdict. Pure; must never throw. */
export type Scorer = (input: ScoreInput) => Verdict;
