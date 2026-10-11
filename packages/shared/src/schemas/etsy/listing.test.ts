import { describe, expect, it } from "vitest";
import { readRealDir, readSynthetic } from "../../../test/fixtures";
import { EtsyListingSchema } from "./listing";
import { EtsyBatchResponseSchema } from "./responses";

const synthetic = EtsyBatchResponseSchema.parse(readSynthetic("etsy/listings-batch.json")).results;
const real = readRealDir("listings");

describe("EtsyListingSchema", () => {
  it.each(synthetic.map((data, i) => [i, data] as const))(
    "parses synthetic listing %i",
    (_, data) => {
      expect(EtsyListingSchema.safeParse(data).success).toBe(true);
    },
  );

  it.skipIf(real.length === 0).each(real.map(({ name, data }) => [name, data] as const))(
    "parses real listing %s",
    (_, data) => {
      const result = EtsyListingSchema.safeParse(data);
      expect(result.error?.issues).toBeUndefined();
    },
  );

  it("keeps only the fields HandSift uses", () => {
    const parsed = EtsyListingSchema.parse(synthetic[0]);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "description",
        "listing_id",
        "listing_type",
        "materials",
        "production_partners",
        "shop",
        "shop_id",
        "tags",
        "title",
        "who_made",
      ].sort(),
    );
  });

  it("accepts a listing without an attached shop", () => {
    const { shop: _shop, ...withoutShop } = EtsyListingSchema.parse(synthetic[0]);
    expect(EtsyListingSchema.safeParse(withoutShop).success).toBe(true);
    expect(EtsyListingSchema.safeParse({ ...withoutShop, shop: null }).success).toBe(true);
  });

  it("rejects a listing missing a field the signals need", () => {
    const { description: _description, ...rest } = EtsyListingSchema.parse(synthetic[0]);
    expect(EtsyListingSchema.safeParse(rest).success).toBe(false);
  });
});
