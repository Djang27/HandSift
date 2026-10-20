import { EtsyBatchResponseSchema, EtsyListingSchema } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import batchFixture from "../../../../fixtures/synthetic/etsy/listings-batch.json";
import { coalesce, type FetchBatch } from "./coalesce";
import { EtsyRateLimitedError, type EtsyBatchResult } from "./etsyClient";

const LISTINGS = EtsyBatchResponseSchema.parse(batchFixture).results.map((r) =>
  EtsyListingSchema.parse(r),
);
const [A, B, C] = LISTINGS.map((l) => String(l.listing_id));
if (!A || !B || !C) throw new Error("fixture too small");

/** A fake Etsy fetch whose calls stay pending until released. */
function controlledFetch() {
  const calls: { ids: readonly string[]; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const fetchBatch = vi.fn<FetchBatch>(
    (ids) =>
      new Promise<EtsyBatchResult>((resolve, reject) => {
        calls.push({
          ids,
          reject,
          resolve: () => {
            resolve({
              listings: LISTINGS.filter((l) => ids.includes(String(l.listing_id))),
              missing: ids.filter((id) => !LISTINGS.some((l) => String(l.listing_id) === id)),
              invalid: [],
              etsyCalls: 1,
              remainingToday: 4000,
            });
          },
        });
      }),
  );
  return { fetchBatch, calls };
}

const ids = (r: EtsyBatchResult) => r.listings.map((l) => String(l.listing_id)).sort();

describe("coalesce", () => {
  it("shares an in-flight Etsy call between concurrent requests", async () => {
    const { fetchBatch, calls } = controlledFetch();
    const fetch = coalesce(fetchBatch);

    const first = fetch([A, B]);
    const second = fetch([B, C]);
    expect(fetchBatch.mock.calls.map(([batch]) => batch)).toEqual([[A, B], [C]]);

    for (const call of calls) call.resolve();
    expect(ids(await first)).toEqual([A, B].sort());
    const secondResult = await second;
    expect(ids(secondResult)).toEqual([B, C].sort());
    expect(secondResult.etsyCalls).toBe(1); // only its own call for C
  });

  it("passes 'missing' through to requests that waited", async () => {
    const { fetchBatch, calls } = controlledFetch();
    const fetch = coalesce(fetchBatch);
    const first = fetch(["42"]);
    const second = fetch(["42"]);
    calls[0]?.resolve();
    await first;
    expect(await second).toMatchObject({ listings: [], missing: ["42"], etsyCalls: 0 });
  });

  it("fetches again once the earlier call has finished (no caching here)", async () => {
    const { fetchBatch, calls } = controlledFetch();
    const fetch = coalesce(fetchBatch);
    const first = fetch([A]);
    calls[0]?.resolve();
    await first;
    const second = fetch([A]);
    calls[1]?.resolve();
    await second;
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });

  it("fails every request that depended on a failed call, then recovers", async () => {
    const { fetchBatch, calls } = controlledFetch();
    const fetch = coalesce(fetchBatch);
    const first = fetch([A]);
    const second = fetch([A]);
    calls[0]?.reject(new EtsyRateLimitedError("429"));
    await expect(first).rejects.toThrow(EtsyRateLimitedError);
    await expect(second).rejects.toThrow(EtsyRateLimitedError);

    const third = fetch([A]);
    calls[1]?.resolve();
    expect(ids(await third)).toEqual([A]);
  });
});
