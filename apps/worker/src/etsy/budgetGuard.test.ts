import { describe, expect, it, vi } from "vitest";
import { EtsyBudgetError, withBudgetGuard } from "./budgetGuard";
import type { FetchBatch } from "./coalesce";
import { EtsyRateLimitedError, type EtsyBatchResult } from "./etsyClient";

const result = (remainingToday: number | null): EtsyBatchResult => ({
  listings: [],
  missing: [],
  invalid: [],
  etsyCalls: 1,
  remainingToday,
});

function setup(...outcomes: (number | null | Error)[]) {
  let now = 0;
  const fetchBatch = vi.fn<FetchBatch>();
  for (const o of outcomes) {
    if (o instanceof Error) fetchBatch.mockRejectedValueOnce(o);
    else fetchBatch.mockResolvedValueOnce(result(o));
  }
  const guarded = withBudgetGuard(fetchBatch, { reserve: 500, recheckMs: 1000, now: () => now });
  return { guarded, fetchBatch, advance: (ms: number) => (now += ms) };
}

describe("withBudgetGuard", () => {
  it("passes calls through while the quota is healthy or unknown", async () => {
    const { guarded, fetchBatch } = setup(null, 4000, 501);
    await guarded(["1"]);
    await guarded(["1"]);
    await expect(guarded(["1"])).resolves.toMatchObject({ remainingToday: 501 });
    expect(fetchBatch).toHaveBeenCalledTimes(3);
  });

  it("stops calling Etsy once the quota drops below the reserve", async () => {
    const { guarded, fetchBatch } = setup(499);
    await expect(guarded(["1"])).resolves.toMatchObject({ remainingToday: 499 });
    await expect(guarded(["2"])).rejects.toThrow(EtsyBudgetError);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });

  it("lets one call through after the recheck interval, and resumes if the quota reset", async () => {
    const { guarded, fetchBatch, advance } = setup(10, 5000, 4999);
    await guarded(["1"]);
    advance(999);
    await expect(guarded(["1"])).rejects.toThrow(EtsyBudgetError);
    advance(1);
    await guarded(["1"]); // probe: quota reset to 5000
    await guarded(["1"]);
    expect(fetchBatch).toHaveBeenCalledTimes(3);
  });

  it("keeps pausing if the probe shows the quota is still low", async () => {
    const { guarded, advance } = setup(10, 5);
    await guarded(["1"]);
    advance(1000);
    await guarded(["1"]);
    await expect(guarded(["1"])).rejects.toThrow(EtsyBudgetError);
  });

  it("pauses after an Etsy 429 instead of retrying into it", async () => {
    const { guarded, fetchBatch } = setup(new EtsyRateLimitedError("429"));
    await expect(guarded(["1"])).rejects.toThrow(EtsyRateLimitedError);
    await expect(guarded(["1"])).rejects.toThrow(EtsyBudgetError);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });

  it("does not pause on other errors", async () => {
    const { guarded, fetchBatch } = setup(new Error("network"), 4000);
    await expect(guarded(["1"])).rejects.toThrow("network");
    await guarded(["1"]);
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });
});
