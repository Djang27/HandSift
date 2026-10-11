import { describe, expect, it } from "vitest";
import { readSynthetic } from "../../test/fixtures";
import { EtsyListingSchema } from "../schemas/etsy/listing";
import { EtsyBatchResponseSchema } from "../schemas/etsy/responses";
import { ListingDataSchema } from "../schemas/listing";
import { ShopDataSchema } from "../schemas/shop";
import { toListingData, toShopData } from "./normalize";

const listings = EtsyBatchResponseSchema.parse(
  readSynthetic("etsy/listings-batch.json"),
).results.map((raw) => EtsyListingSchema.parse(raw));

describe("normalize", () => {
  it("produces valid ListingData and ShopData for every synthetic listing", () => {
    for (const listing of listings) {
      expect(ListingDataSchema.safeParse(toListingData(listing)).success).toBe(true);
      if (listing.shop) {
        expect(ShopDataSchema.safeParse(toShopData(listing.shop)).success).toBe(true);
      }
    }
  });

  it("decodes entities and maps fields", () => {
    const encoded = listings.find((l) => l.description.includes("&quot;"));
    expect(encoded).toBeDefined();
    if (!encoded) return;
    const data = toListingData(encoded);
    expect(data.description).toContain('"Printable"');
    expect(data.listingId).toBe(String(encoded.listing_id));
  });

  it("flags production partners", () => {
    const partnered = listings.filter((l) => l.production_partners.length > 0);
    expect(partnered.length).toBeGreaterThan(0);
    for (const l of partnered) expect(toListingData(l).hasProductionPartner).toBe(true);
  });

  it("converts shop create_date from seconds to ms", () => {
    const shop = listings[0]?.shop;
    expect(shop).toBeTruthy();
    if (shop) expect(toShopData(shop).createdAt).toBe(shop.create_date * 1000);
  });
});
