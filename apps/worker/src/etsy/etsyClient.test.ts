import { describe, expect, it, vi } from "vitest";
import batchFixture from "../../../../fixtures/synthetic/etsy/listings-batch.json";
import { EtsyRateLimitedError, EtsyUpstreamError, fetchListingsBatch } from "./etsyClient";

const ALL_IDS = batchFixture.results.map((l) => String(l.listing_id));

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

function batchOf(ids: readonly string[]) {
  const results = batchFixture.results.filter((l) => ids.includes(String(l.listing_id)));
  return { count: results.length, results };
}

function fakeFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const res of responses) fn.mockResolvedValueOnce(res);
  return fn;
}

const options = (fetchFn: typeof fetch) => ({ apiKey: "key:secret", fetch: fetchFn });

function calledUrl(fetchFn: ReturnType<typeof fakeFetch>, call = 0): string {
  const input = fetchFn.mock.calls[call]?.[0];
  if (input === undefined) throw new Error(`fetch call ${String(call)} not made`);
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("fetchListingsBatch", () => {
  it("fetches listings with shops attached, sending the API key", async () => {
    const fetchFn = fakeFetch(json(batchOf(ALL_IDS), 200, { "x-remaining-today": "4321" }));
    const result = await fetchListingsBatch(ALL_IDS, options(fetchFn));

    expect(result.listings).toHaveLength(ALL_IDS.length);
    expect(result.listings[0]?.shop).toBeTruthy();
    expect(result).toMatchObject({ missing: [], invalid: [], etsyCalls: 1, remainingToday: 4321 });

    expect(calledUrl(fetchFn)).toContain(`listing_ids=${ALL_IDS.join(",")}`);
    expect(calledUrl(fetchFn)).toContain("includes=Shop");
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get("x-api-key")).toBe("key:secret");
  });

  it("drops IDs Etsy says are missing and retries once", async () => {
    const [a, b] = ALL_IDS;
    if (!a || !b) throw new Error("fixture too small");
    const fetchFn = fakeFetch(
      json({ error: `Not all requested listings exist. Missing listing_ids: 42.` }, 404),
      json(batchOf([a, b])),
    );
    const result = await fetchListingsBatch([a, "42", b], options(fetchFn));

    expect(result.missing).toEqual(["42"]);
    expect(result.listings.map((l) => String(l.listing_id))).toEqual([a, b]);
    expect(result.etsyCalls).toBe(2);
    expect(calledUrl(fetchFn, 1)).toContain(`listing_ids=${a},${b}&`);
  });

  it("makes no second call when every ID is missing", async () => {
    const fetchFn = fakeFetch(
      json({ error: "Not all requested listings exist. Missing listing_ids: 7, 8." }, 404),
    );
    const result = await fetchListingsBatch(["7", "8"], options(fetchFn));
    expect(result).toMatchObject({ listings: [], missing: ["7", "8"], etsyCalls: 1 });
  });

  it("gives up if the retry also returns 404", async () => {
    const notFound = () =>
      json({ error: "Not all requested listings exist. Missing listing_ids: 1." }, 404);
    const fetchFn = fakeFetch(notFound(), notFound());
    await expect(fetchListingsBatch(["1", "2"], options(fetchFn))).rejects.toThrow(
      EtsyUpstreamError,
    );
  });

  it("treats an unparseable 404 as an upstream error, never a guess", async () => {
    const fetchFn = fakeFetch(json({ error: "Something else went wrong" }, 404));
    await expect(fetchListingsBatch(["1"], options(fetchFn))).rejects.toThrow(EtsyUpstreamError);
  });

  it("rejects a 404 naming IDs that weren't requested", async () => {
    const fetchFn = fakeFetch(
      json({ error: "Not all requested listings exist. Missing listing_ids: 999." }, 404),
    );
    await expect(fetchListingsBatch(["1"], options(fetchFn))).rejects.toThrow(EtsyUpstreamError);
  });

  it("reports listings that fail validation as invalid", async () => {
    const [first] = batchFixture.results;
    const broken = { ...first, description: undefined };
    const fetchFn = fakeFetch(json({ count: 1, results: [broken] }));
    const result = await fetchListingsBatch([String(first?.listing_id)], options(fetchFn));
    expect(result.listings).toEqual([]);
    expect(result.invalid).toEqual([String(first?.listing_id)]);
  });

  it("throws EtsyRateLimitedError on 429", async () => {
    const fetchFn = fakeFetch(json({ error: "Too many requests" }, 429));
    await expect(fetchListingsBatch(["1"], options(fetchFn))).rejects.toThrow(EtsyRateLimitedError);
  });

  it("throws EtsyUpstreamError on server errors, bad JSON, and network failures", async () => {
    await expect(fetchListingsBatch(["1"], options(fakeFetch(json({}, 500))))).rejects.toThrow(
      EtsyUpstreamError,
    );
    await expect(
      fetchListingsBatch(["1"], options(fakeFetch(new Response("not json")))),
    ).rejects.toThrow(EtsyUpstreamError);
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down"));
    await expect(fetchListingsBatch(["1"], options(failing))).rejects.toThrow(EtsyUpstreamError);
  });

  it("refuses empty or oversized batches before calling Etsy", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(fetchListingsBatch([], options(fetchFn))).rejects.toThrow(RangeError);
    const tooMany = Array.from({ length: 101 }, (_, i) => String(i + 1));
    await expect(fetchListingsBatch(tooMany, options(fetchFn))).rejects.toThrow(RangeError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
