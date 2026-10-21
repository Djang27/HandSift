import { MAX_IDS_PER_REQUEST } from "@handsift/shared";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import batchFixture from "../../../fixtures/synthetic/etsy/listings-batch.json";
import { fetchListingsBatch } from "./etsy/etsyClient";
import { route } from "./router";
import { createRouterDeps } from "./wiring";

// Cloudflare's free plan allows 50 subrequests per request, counting fetch(), Cache API
// calls, and D1 calls. Staging hit this with 52 listings when there was a per-listing edge
// cache. Keep a full-size request far below it.
const FREE_PLAN_SUBREQUESTS = 50;
const BUDGET = 10;

const template = batchFixture.results[0];
if (!template) throw new Error("fixture empty");

/** Fake Etsy: returns a valid listing for every requested ID. Counts calls. */
function fakeEtsy() {
  const fetchFn = vi.fn<typeof fetch>((input) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const ids = (url.searchParams.get("listing_ids") ?? "").split(",");
    const results = ids.map((id) => ({ ...template, listing_id: Number(id) }));
    return Promise.resolve(Response.json({ count: results.length, results }));
  });
  return fetchFn;
}

/** Counts Cache API calls on the default cache (each is a subrequest). */
function countCacheCalls() {
  let calls = 0;
  const cache = caches.default;
  for (const method of ["match", "put", "delete"] as const) {
    const original = cache[method].bind(cache) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(cache, method).mockImplementation((...args: unknown[]) => {
      calls++;
      return original(...args) as never;
    });
  }
  return () => calls;
}

/** Counts D1 round trips: each executed statement and each batch is one subrequest. */
function countD1Calls() {
  const prepare = env.DB.prepare.bind(env.DB);
  let calls = 0;
  vi.spyOn(env.DB, "prepare").mockImplementation((query) => {
    const stmt = prepare(query);
    if (query.trimStart().startsWith("SELECT")) calls++; // reads run once per prepared query here
    return stmt;
  });
  const batch = env.DB.batch.bind(env.DB);
  vi.spyOn(env.DB, "batch").mockImplementation((statements) => {
    calls++;
    return batch(statements);
  });
  return () => calls;
}

async function fullRequest(ids: string[], etsy: ReturnType<typeof fakeEtsy>) {
  const ctx = createExecutionContext();
  const deps = createRouterDeps(env, ctx, (batchIds) =>
    fetchListingsBatch(batchIds, { apiKey: "k:s", fetch: etsy }),
  );
  const res = await route(new Request(`https://w.test/v1/listings?ids=${ids.join(",")}`), deps);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("subrequest budget", () => {
  it(`a ${String(MAX_IDS_PER_REQUEST)}-listing request stays far under the free plan's limit, cold and warm`, async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const ids = Array.from({ length: MAX_IDS_PER_REQUEST }, (_, i) => String(8_000_000_000 + i));
    const d1Calls = countD1Calls();
    const cacheCalls = countCacheCalls();

    const etsy = fakeEtsy();
    const cold = await fullRequest(ids, etsy);
    expect(cold.status).toBe(200);
    const coldTotal = d1Calls() + cacheCalls() + etsy.mock.calls.length;

    const warmEtsy = fakeEtsy();
    const before = d1Calls() + cacheCalls();
    await fullRequest(ids, warmEtsy);
    const warmTotal = d1Calls() + cacheCalls() - before + warmEtsy.mock.calls.length;

    expect(warmEtsy).not.toHaveBeenCalled(); // served from D1
    expect(coldTotal).toBeLessThanOrEqual(BUDGET);
    expect(warmTotal).toBeLessThanOrEqual(BUDGET);
    expect(BUDGET).toBeLessThan(FREE_PLAN_SUBREQUESTS);
  });
});
