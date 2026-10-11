import type { ListingData } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { realInputs, syntheticInputs } from "../../../test/fixtures";
import { designedBy } from "./designedBy";

function listing(overrides: Partial<ListingData>): ListingData {
  return {
    listingId: "1",
    shopId: "2",
    title: "",
    description: "",
    tags: [],
    materials: [],
    whoMade: "i_did",
    listingType: "physical",
    hasProductionPartner: false,
    ...overrides,
  };
}

describe("designedBy", () => {
  it.each([
    ["someone_else", true, true],
    ["someone_else", false, false],
    ["i_did", true, false],
    ["i_did", false, false],
    ["collective", true, false],
    [null, true, false],
  ] as const)("whoMade=%s, partner=%s -> hit=%s", (whoMade, hasProductionPartner, hit) => {
    expect(designedBy.evaluate({ listing: listing({ whoMade, hasProductionPartner }) }).hit).toBe(
      hit,
    );
  });

  it("explains that it is not proof of AI", () => {
    const signal = designedBy.evaluate({
      listing: listing({ whoMade: "someone_else", hasProductionPartner: true }),
    });
    expect(signal).toMatchObject({ id: "designedBy", weight: 0.25, hit: true });
    expect(signal.reason).toContain("not proof of AI");
  });

  it.each(syntheticInputs().map((input) => [input.listing.listingId, input] as const))(
    "is correct on synthetic listing %s",
    (id, input) => {
      expect(designedBy.evaluate(input).hit).toBe(["1000000003", "1000000007"].includes(id));
    },
  );

  // Real fixtures: the AI print and the print-on-demand shirt use production partners.
  // The print-on-demand mug (4313398169) shows "Designed by" on Etsy but looks handmade in
  // the API, so it's an expected miss.
  const real = realInputs();
  it.skipIf(real.length === 0).each(real.map((input) => [input.listing.listingId, input] as const))(
    "is correct on real listing %s",
    (id, input) => {
      expect(designedBy.evaluate(input).hit).toBe(["1709093288", "4310461041"].includes(id));
    },
  );
});
