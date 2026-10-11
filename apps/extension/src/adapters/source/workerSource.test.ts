import { WORKER_BACKOFF_MS, type V1ListingsResponse } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import { syntheticInputs } from "../../../test/fixtures";
import { createWorkerSource } from "./workerSource";

const BASE = "https://worker.test";
const [first] = syntheticInputs();
if (!first) throw new Error("no fixtures");
const RESULT = { listing: first.listing, shop: first.shop ?? null, fetchedAt: 1 };

function reply(body: Partial<V1ListingsResponse>, status = 200): Response {
  return Response.json({ results: [], missing: [], unavailable: [], ...body }, { status });
}

function setup(...responses: (Response | Error)[]) {
  let now = 1_000;
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchFn.mockRejectedValueOnce(r);
    else fetchFn.mockResolvedValueOnce(r);
  }
  const source = createWorkerSource({
    baseUrl: BASE,
    version: "1.2.3",
    fetch: fetchFn,
    now: () => now,
  });
  return { source, fetchFn, advance: (ms: number) => (now += ms) };
}

function calledUrl(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): URL {
  const input = fetchFn.mock.calls[call]?.[0];
  if (input === undefined) throw new Error("not called");
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

describe("workerSource", () => {
  it("calls /v1/listings with the IDs and version header, returning validated data", async () => {
    const { source, fetchFn } = setup(reply({ results: [RESULT], missing: ["9"] }));
    const lookup = await source.getListings([first.listing.listingId, "9"]);

    expect(lookup).toEqual({ results: [RESULT], missing: ["9"], unavailable: [] });
    const url = calledUrl(fetchFn);
    expect(url.pathname).toBe("/v1/listings");
    expect(url.searchParams.get("ids")).toBe(`${first.listing.listingId},9`);
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get("X-HandSift-Version")).toBe(
      "1.2.3",
    );
  });

  it("splits more than 100 IDs into Worker-sized batches", async () => {
    const { source, fetchFn } = setup(reply({}), reply({}), reply({}));
    await source.getListings(Array.from({ length: 250 }, (_, i) => String(i + 1)));
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(calledUrl(fetchFn, 2).searchParams.get("ids")?.split(",")).toHaveLength(50);
  });

  it.each([
    ["an HTTP error", () => reply({}, 429)],
    ["an invalid body", () => Response.json({ nope: true })],
    ["a network failure", () => new TypeError("offline")],
  ])("turns %s into unavailable, without throwing", async (_, make) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { source } = setup(make());
    expect(await source.getListings(["1", "2"])).toEqual({
      results: [],
      missing: [],
      unavailable: ["1", "2"],
    });
  });

  it("backs off after trouble, then resumes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { source, fetchFn, advance } = setup(reply({}, 500), reply({ results: [RESULT] }));

    await source.getListings(["1"]);
    expect((await source.getListings(["1"])).unavailable).toEqual(["1"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    advance(WORKER_BACKOFF_MS);
    expect((await source.getListings(["1"])).results).toEqual([RESULT]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("also backs off when the Worker reports unavailable listings (Etsy trouble)", async () => {
    const { source, fetchFn } = setup(reply({ unavailable: ["1"] }));
    await source.getListings(["1"]);
    await source.getListings(["2"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
