import { describe, expect, it } from "vitest";
import { VerdictSchema } from "./verdict";

const valid = {
  listingId: "123",
  level: "disclosed_ai",
  score: 1,
  reasons: ["Description says the art was made with Midjourney"],
  checkedAt: 1_700_000_000_000,
};

describe("VerdictSchema", () => {
  it("accepts a valid verdict", () => {
    expect(VerdictSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an unknown level", () => {
    expect(VerdictSchema.safeParse({ ...valid, level: "maybe" }).success).toBe(false);
  });

  it("rejects a score outside 0 to 1", () => {
    expect(VerdictSchema.safeParse({ ...valid, score: 1.5 }).success).toBe(false);
  });
});
