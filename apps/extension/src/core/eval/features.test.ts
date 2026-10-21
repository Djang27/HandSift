import type { Signal, V1ListingResult, Verdict } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { listingFeatures } from "./features";

const NOW = Date.UTC(2026, 9, 21);
const DAY = 24 * 60 * 60 * 1000;

const SHOP = {
  shopId: "9",
  createdAt: NOW - 100 * DAY,
  activeListingCount: 400,
  digitalListingCount: 100,
  salesCount: 40,
};

const result: V1ListingResult = {
  listing: {
    listingId: "1",
    shopId: "9",
    title: "",
    description: "",
    tags: [],
    materials: [],
    whoMade: "someone_else",
    listingType: "physical",
    hasProductionPartner: true,
  },
  shop: {
    shopId: "9",
    createdAt: NOW - 100 * DAY,
    activeListingCount: 400,
    digitalListingCount: 100,
    salesCount: 40,
  },
  fetchedAt: NOW,
};

const signals: Signal[] = [
  { id: "descriptionDisclosure", kind: "disclosure", weight: 1, hit: false, reason: "" },
  { id: "designedBy", kind: "inference", weight: 0.25, hit: true, reason: "" },
  { id: "shopHeuristics", kind: "inference", weight: 0, hit: false, reason: "" },
];

const verdict: Verdict = {
  listingId: "1",
  level: "unclear",
  score: 0.25,
  reasons: [],
  checkedAt: NOW,
};

describe("listingFeatures", () => {
  it("summarizes what HandSift saw for one listing", () => {
    expect(listingFeatures(result, signals, verdict)).toEqual({
      id: "1",
      score: 0.25,
      level: "unclear",
      disclosed: false,
      clues: ["designedBy"],
      shopAgeDays: 100,
      activeListings: 400,
      digitalShare: 0.25,
      salesPerListing: 0.1,
      whoMade: "someone_else",
      productionPartner: true,
      listingType: "physical",
    });
  });

  it("handles a missing shop and an empty catalog", () => {
    const noShop = listingFeatures({ ...result, shop: null }, signals, verdict);
    expect(noShop).toMatchObject({
      shopAgeDays: null,
      activeListings: null,
      digitalShare: null,
      salesPerListing: null,
    });
    const empty = listingFeatures(
      { ...result, shop: { ...SHOP, activeListingCount: 0 } },
      signals,
      verdict,
    );
    expect(empty).toMatchObject({ activeListings: 0, digitalShare: null, salesPerListing: null });
  });
});
