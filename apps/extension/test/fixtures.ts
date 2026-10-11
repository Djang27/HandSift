// Test-only fixture loading for the extension. Real fixtures are gitignored, so the
// real* helpers return [] in CI and on fresh clones.

import {
  EtsyBatchResponseSchema,
  EtsyListingSchema,
  toListingData,
  toShopData,
} from "@handsift/shared";
import type { SignalInput } from "@handsift/shared/interfaces";
import syntheticBatch from "../../../fixtures/synthetic/etsy/listings-batch.json";
import labelsCsv from "../../../data/labels.csv?raw";

const realListingFiles = import.meta.glob<unknown>("../../../fixtures/real/listings/*.json", {
  eager: true,
  import: "default",
});

function toSignalInput(raw: unknown): SignalInput {
  const etsy = EtsyListingSchema.parse(raw);
  const listing = toListingData(etsy);
  return etsy.shop ? { listing, shop: toShopData(etsy.shop) } : { listing };
}

export function syntheticInputs(): SignalInput[] {
  return EtsyBatchResponseSchema.parse(syntheticBatch).results.map(toSignalInput);
}

export function realInputs(): SignalInput[] {
  return Object.values(realListingFiles).map(toSignalInput);
}

/** Hand labels from data/labels.csv: listing ID -> "ai" | "human". */
export function labels(): Map<string, "ai" | "human"> {
  const rows = labelsCsv.trim().split("\n").slice(1);
  return new Map(
    rows.map((row) => {
      const [id = "", label = ""] = row.split(",");
      if (label !== "ai" && label !== "human") throw new Error(`Bad label row: ${row}`);
      return [id, label];
    }),
  );
}
