import type { ListingData, Sensitivity, Signal } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { labels, realInputs, syntheticInputs } from "../../../test/fixtures";
import { SIGNALS } from "../signals";
import { displayLevel } from "./levels";
import { score } from "./score";

const LISTING = { listingId: "1" } as ListingData;
const SENSITIVITIES: Sensitivity[] = ["conservative", "balanced", "aggressive"];

function signal(
  kind: Signal["kind"],
  weight: number,
  hit = true,
  reason = `${kind} ${String(weight)}`,
): Signal {
  return { id: `${kind}-${String(weight)}`, kind, weight, hit, reason };
}

const scored = (signals: Signal[]) => score({ listing: LISTING, signals, checkedAt: 5 });

describe("score", () => {
  it("is clean with no hits", () => {
    expect(scored([signal("disclosure", 1, false), signal("inference", 0.5, false)])).toEqual({
      listingId: "1",
      level: "clean",
      score: 0,
      reasons: [],
      checkedAt: 5,
    });
  });

  it("is disclosed_ai whenever a disclosure hits, listing disclosure reasons first", () => {
    const v = scored([
      signal("inference", 0.25, true, "partner"),
      signal("disclosure", 1, true, "seller said AI"),
    ]);
    expect(v).toMatchObject({
      level: "disclosed_ai",
      score: 1,
      reasons: ["seller said AI", "partner"],
    });
  });

  it("combines inference weights as 1 - product(1 - w)", () => {
    expect(scored([signal("inference", 0.5), signal("inference", 0.5)]).score).toBeCloseTo(0.75);
  });

  it("clamps weights outside 0..1", () => {
    expect(scored([signal("inference", 3)]).score).toBe(1);
    expect(scored([signal("inference", -1)]).score).toBe(0);
  });

  it("never calls a single moderate clue (designedBy, 0.25) likely AI, at any sensitivity", () => {
    const v = scored([signal("inference", 0.25)]);
    for (const s of SENSITIVITIES) expect(displayLevel(v, s)).toBe("unclear");
  });
});

describe("displayLevel", () => {
  const v = scored([signal("inference", 0.5), signal("inference", 0.5)]); // 0.75

  it("re-derives inferred levels for the user's sensitivity", () => {
    expect(displayLevel(v, "conservative")).toBe("unclear");
    expect(displayLevel(v, "balanced")).toBe("likely_ai");
    expect(displayLevel(v, "aggressive")).toBe("likely_ai");
  });

  it("keeps disclosures at every sensitivity, and failed evaluations unclear", () => {
    const disclosed = scored([signal("disclosure", 1)]);
    for (const s of SENSITIVITIES) expect(displayLevel(disclosed, s)).toBe("disclosed_ai");
    const failed = {
      listingId: "1",
      level: "unclear" as const,
      score: 0,
      reasons: [],
      checkedAt: 1,
    };
    expect(displayLevel(failed, "aggressive")).toBe("unclear");
  });
});

describe("score with the real signal registry", () => {
  const evaluate = (input: ReturnType<typeof syntheticInputs>[number]) =>
    score({ listing: input.listing, signals: SIGNALS.map((s) => s.evaluate(input)), checkedAt: 1 });

  it.each(syntheticInputs().map((input) => [input.listing.listingId, input] as const))(
    "synthetic listing %s: only disclosed AI is flagged",
    (id, input) => {
      const v = evaluate(input);
      const isAi = ["1000000001", "1000000002", "1000000003"].includes(id);
      for (const s of SENSITIVITIES) {
        expect(displayLevel(v, s)).toSatisfy((l: string) =>
          isAi ? l === "disclosed_ai" : l === "clean" || l === "unclear",
        );
      }
    },
  );

  const real = realInputs();
  const realLabels = labels();
  it.skipIf(real.length === 0).each(real.map((input) => [input.listing.listingId, input] as const))(
    "real listing %s: flagged exactly when hand-labeled AI, at every sensitivity",
    (id, input) => {
      const v = evaluate(input);
      const flagged = (s: Sensitivity) =>
        ["disclosed_ai", "likely_ai"].includes(displayLevel(v, s));
      for (const s of SENSITIVITIES) expect(flagged(s)).toBe(realLabels.get(id) === "ai");
    },
  );
});
