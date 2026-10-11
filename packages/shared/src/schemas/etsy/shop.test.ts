import { describe, expect, it } from "vitest";
import { readRealDir, readSynthetic } from "../../../test/fixtures";
import { EtsyListingSchema } from "./listing";
import { EtsyBatchResponseSchema } from "./responses";
import { EtsyShopSchema } from "./shop";

const syntheticShops = EtsyBatchResponseSchema.parse(
  readSynthetic("etsy/listings-batch.json"),
).results.map((listing) => EtsyListingSchema.parse(listing).shop);
const real = readRealDir("shops");

describe("EtsyShopSchema", () => {
  it("every synthetic listing carries a valid shop", () => {
    for (const shop of syntheticShops) {
      expect(shop).toBeTruthy();
    }
  });

  it.skipIf(real.length === 0).each(real.map(({ name, data }) => [name, data] as const))(
    "parses real shop %s",
    (_, data) => {
      expect(EtsyShopSchema.safeParse(data).error?.issues).toBeUndefined();
    },
  );

  it("strips personal information", () => {
    const raw = {
      shop_id: 1,
      create_date: 0,
      listing_active_count: 1,
      digital_listing_count: 0,
      transaction_sold_count: 0,
      login_name: "someone",
      policy_seller_info: "Name, Address",
    };
    const parsed = EtsyShopSchema.parse(raw);
    expect(parsed).not.toHaveProperty("login_name");
    expect(parsed).not.toHaveProperty("policy_seller_info");
  });
});
