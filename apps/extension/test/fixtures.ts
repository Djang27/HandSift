// Test-only fixture loading for the extension. Real fixtures are gitignored, so the
// real* helpers return [] in CI and on fresh clones.

import {
  EtsyBatchResponseSchema,
  EtsyListingSchema,
  toListingData,
  toShopData,
} from "@handsift/shared";
import type { SignalInput } from "@handsift/shared/interfaces";
import { parseLabels } from "../src/core/eval/labels";
import syntheticBatch from "../../../fixtures/synthetic/etsy/listings-batch.json";
import labelsCsv from "../../../data/labels.csv?raw";

const realListingFiles = import.meta.glob<unknown>("../../../fixtures/real/listings/*.json", {
  eager: true,
  import: "default",
});

/** Fixed "fetch time" for fixtures (Oct 10, 2026), so shop ages are deterministic. */
export const FIXTURE_FETCHED_AT = Date.UTC(2026, 9, 10);

function toSignalInput(raw: unknown): SignalInput {
  const etsy = EtsyListingSchema.parse(raw);
  const listing = toListingData(etsy);
  const fetchedAt = FIXTURE_FETCHED_AT;
  return etsy.shop ? { listing, shop: toShopData(etsy.shop), fetchedAt } : { listing, fetchedAt };
}

export function syntheticInputs(): SignalInput[] {
  return EtsyBatchResponseSchema.parse(syntheticBatch).results.map(toSignalInput);
}

export function realInputs(): SignalInput[] {
  return Object.values(realListingFiles).map(toSignalInput);
}

/** Hand labels from data/labels.csv: listing ID -> "ai" | "human". */
export function labels(): Map<string, "ai" | "human"> {
  const { rows, errors } = parseLabels(labelsCsv);
  if (errors.length > 0) throw new Error(`Bad data/labels.csv: ${errors.join("; ")}`);
  return new Map(rows.map((row) => [row.id, row.label]));
}
