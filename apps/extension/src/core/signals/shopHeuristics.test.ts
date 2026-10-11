import {
  SHOP_HEURISTICS as H,
  SIGNAL_WEIGHTS,
  type ListingData,
  type ShopData,
} from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { FIXTURE_FETCHED_AT, realInputs } from "../../../test/fixtures";
import { shopHeuristics } from "./shopHeuristics";

const NOW = FIXTURE_FETCHED_AT;
const DAY = 24 * 60 * 60 * 1000;
const LISTING = { listingId: "1" } as ListingData;

function shop(overrides: Partial<ShopData>): ShopData {
  return {
    shopId: "9",
    createdAt: NOW - 3 * 365 * DAY,
    activeListingCount: 40,
    digitalListingCount: 0,
    salesCount: 800,
    ...overrides,
  };
}

const evaluate = (s?: ShopData) =>
  shopHeuristics.evaluate(
    s ? { listing: LISTING, shop: s, fetchedAt: NOW } : { listing: LISTING, fetchedAt: NOW },
  );

describe("shopHeuristics", () => {
  it("is quiet for an ordinary established shop, or with no shop data", () => {
    expect(evaluate(shop({}))).toMatchObject({
      id: "shopHeuristics",
      kind: "inference",
      hit: false,
      weight: 0,
    });
    expect(evaluate()).toMatchObject({ hit: false, reason: "No shop data" });
  });

  it("flags a brand-new shop with a huge catalog", () => {
    const s = evaluate(
      shop({ createdAt: NOW - 30 * DAY, activeListingCount: 900, salesCount: 900 }),
    );
    expect(s.hit).toBe(true);
    expect(s.weight).toBeCloseTo(H.newBulkWeight);
    expect(s.reason).toBe("Shop: opened 30 days ago and already has 900 listings");
  });

  it("does not flag a new shop with a normal catalog, or an old shop with a huge one", () => {
    expect(evaluate(shop({ createdAt: NOW - 30 * DAY, activeListingCount: 40 })).hit).toBe(false);
    expect(evaluate(shop({ activeListingCount: 1675, salesCount: 1120 })).hit).toBe(false);
  });

  it("flags a mostly-digital catalog only above the minimum size", () => {
    expect(
      evaluate(shop({ activeListingCount: 146, digitalListingCount: 146 })).weight,
    ).toBeCloseTo(H.digitalWeight);
    expect(evaluate(shop({ activeListingCount: 15, digitalListingCount: 15 })).hit).toBe(false);
  });

  it("flags few sales for the shop's size, but not small shops with no sales yet", () => {
    expect(evaluate(shop({ activeListingCount: 500, salesCount: 10 })).weight).toBeCloseTo(
      H.lowSalesWeight,
    );
    expect(evaluate(shop({ activeListingCount: 17, salesCount: 0 })).hit).toBe(false);
  });

  it("combines clues as 1 - product(1 - w), capped, listing every reason", () => {
    const s = evaluate(
      shop({
        createdAt: NOW - 77 * DAY,
        activeListingCount: 900,
        digitalListingCount: 880,
        salesCount: 3,
      }),
    );
    const combined = 1 - (1 - H.newBulkWeight) * (1 - H.digitalWeight) * (1 - H.lowSalesWeight);
    expect(s.weight).toBeCloseTo(Math.min(combined, SIGNAL_WEIGHTS.shopHeuristics));
    expect(s.reason).toContain("months ago");
    expect(s.reason).toContain("digital downloads");
    expect(s.reason).toContain("3 sales across 900 listings");
  });

  it("treats a creation date after the fetch time (clock skew) as a brand-new shop", () => {
    const s = evaluate(shop({ createdAt: NOW + DAY, activeListingCount: 400, salesCount: 400 }));
    expect(s.reason).toContain("opened today");
  });

  // Real fixtures: only the two all-digital AI shops trip a clue (mostly digital), which is
  // weak on purpose: many honest printable-art shops are all digital too.
  const real = realInputs();
  it.skipIf(real.length === 0).each(real.map((input) => [input.listing.listingId, input] as const))(
    "real listing %s",
    (id, input) => {
      const s = shopHeuristics.evaluate(input);
      expect(s.hit).toBe(["1317074462", "1328685062"].includes(id));
      if (s.hit) expect(s.weight).toBeCloseTo(H.digitalWeight);
    },
  );
});
