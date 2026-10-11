import { describe, expect, it } from "vitest";
import { readSynthetic } from "../../../test/fixtures";
import { EtsyBatchResponseSchema, EtsyErrorSchema } from "./responses";

describe("Etsy response envelopes", () => {
  it("parses a batch response", () => {
    const batch = EtsyBatchResponseSchema.parse(readSynthetic("etsy/listings-batch.json"));
    expect(batch.results).toHaveLength(batch.count);
  });

  it("parses the missing-listings error", () => {
    const error = EtsyErrorSchema.parse(readSynthetic("etsy/error-missing-listings.json"));
    expect(error.error).toContain("Missing listing_ids");
  });
});
