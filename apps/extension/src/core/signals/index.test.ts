import { SIGNAL_WEIGHTS, type ListingData } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { SIGNALS } from "./index";

const EMPTY: ListingData = {
  listingId: "1",
  shopId: "2",
  title: "",
  description: "",
  tags: [],
  materials: [],
  whoMade: null,
  listingType: "",
  hasProductionPartner: false,
};

describe("signal registry", () => {
  it("has unique ids, each with a configured weight", () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SIGNALS) {
      expect(s.defaultWeight).toBe(SIGNAL_WEIGHTS[s.id as keyof typeof SIGNAL_WEIGHTS]);
    }
  });

  it("every signal handles empty data without throwing and reports its own id", () => {
    for (const s of SIGNALS) {
      const signal = s.evaluate({ listing: EMPTY });
      expect(signal).toMatchObject({ id: s.id, kind: s.kind, hit: false });
      expect(signal.reason.length).toBeGreaterThan(0);
    }
  });
});
