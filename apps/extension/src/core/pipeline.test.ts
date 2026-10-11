import { VERDICT_TTL_MS, type V1ListingResult, type Verdict } from "@handsift/shared";
import type { ItemSource, ListingsLookup, SignalModule } from "@handsift/shared/interfaces";
import { describe, expect, it, vi } from "vitest";
import { syntheticInputs } from "../../test/fixtures";
import { createMemoryStore } from "../adapters/storage/memoryStore";
import { checkListings, type PipelineDeps } from "./pipeline";
import { unscored } from "./scoring/unscored";
import { SIGNALS } from "./signals";

const NOW = 1_800_000_000_000;
const inputs = syntheticInputs();
const byId = new Map(inputs.map((i) => [i.listing.listingId, i]));
const [AI, HANDMADE, OTHER] = ["1000000001", "1000000004", "1000000005"];

function result(id: string, fetchedAt = NOW): V1ListingResult {
  const input = byId.get(id);
  if (!input) throw new Error(`no fixture ${id}`);
  return { listing: input.listing, shop: input.shop ?? null, fetchedAt };
}

function source(lookup: (ids: readonly string[]) => Partial<ListingsLookup>) {
  const getListings = vi.fn((ids: readonly string[]) =>
    Promise.resolve({ results: [], missing: [], unavailable: [], ...lookup(ids) }),
  );
  return { getListings } satisfies ItemSource;
}

const serveFixtures = source((ids) => ({
  results: ids.flatMap((id) => (byId.has(id) ? [result(id)] : [])),
}));

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    store: createMemoryStore(),
    source: serveFixtures,
    signals: SIGNALS,
    score: unscored,
    now: () => NOW,
    ...overrides,
  };
}

const verdict = (id: string, checkedAt: number): Verdict => ({
  listingId: id,
  level: "clean",
  score: 0,
  reasons: [],
  checkedAt,
});

describe("checkListings", () => {
  it("fetches unknown listings, runs every signal, stores, and returns in request order", async () => {
    const d = deps({ source: source((ids) => ({ results: ids.map((id) => result(id)) })) });
    const { verdicts, unavailable } = await checkListings([HANDMADE, AI], d);

    expect(verdicts.map((v) => v.listingId)).toEqual([HANDMADE, AI]);
    expect(verdicts[1]?.reasons[0]).toContain("Seller disclosed AI");
    expect(verdicts[0]?.reasons).toEqual([]);
    expect(unavailable).toEqual([]);
    expect((await d.store.get([AI, HANDMADE])).size).toBe(2);
  });

  it("serves fresh stored verdicts without asking the source", async () => {
    const store = createMemoryStore();
    await store.put([verdict(AI, NOW - 1000)]);
    const src = source(() => ({}));
    const { verdicts } = await checkListings([AI], deps({ store, source: src }));
    expect(verdicts).toEqual([verdict(AI, NOW - 1000)]);
    expect(src.getListings).not.toHaveBeenCalled();
  });

  it("refetches verdicts older than VERDICT_TTL_MS (Etsy's freshness limit)", async () => {
    const store = createMemoryStore();
    await store.put([verdict(AI, NOW - VERDICT_TTL_MS)]);
    const src = source((ids) => ({ results: ids.map((id) => result(id)) }));
    const { verdicts } = await checkListings([AI], deps({ store, source: src }));
    expect(src.getListings).toHaveBeenCalledWith([AI]);
    expect(verdicts[0]?.checkedAt).toBe(NOW);
  });

  it("asks the source only for what it lacks, once per unique ID", async () => {
    const store = createMemoryStore();
    await store.put([verdict(AI, NOW)]);
    const src = source((ids) => ({ results: ids.map((id) => result(id)) }));
    await checkListings([AI, HANDMADE, HANDMADE], deps({ store, source: src }));
    expect(src.getListings).toHaveBeenCalledExactlyOnceWith([HANDMADE]);
  });

  it("gives no verdict for missing or unavailable listings and reports unavailable ones", async () => {
    const src = source(() => ({ results: [result(AI)], missing: ["42"], unavailable: [HANDMADE] }));
    const { verdicts, unavailable } = await checkListings(
      [AI, "42", HANDMADE],
      deps({ source: src }),
    );
    expect(verdicts.map((v) => v.listingId)).toEqual([AI]);
    expect(unavailable).toEqual([HANDMADE]);
  });

  it("never shows data older than the freshness limit, even if the source returns it", async () => {
    const src = source(() => ({ results: [result(AI, NOW - VERDICT_TTL_MS)] }));
    const { verdicts, unavailable } = await checkListings([AI], deps({ source: src }));
    expect(verdicts).toEqual([]);
    expect(unavailable).toEqual([AI]);
  });

  it("ignores results for IDs it didn't ask for", async () => {
    const src = source(() => ({ results: [result(AI), result(OTHER)] }));
    const { verdicts } = await checkListings([AI], deps({ source: src }));
    expect(verdicts.map((v) => v.listingId)).toEqual([AI]);
  });

  it("returns an unclear verdict instead of throwing when a signal fails", async () => {
    const broken: SignalModule = {
      id: "broken",
      defaultWeight: 1,
      evaluate: () => {
        throw new Error("boom");
      },
    };
    const { verdicts } = await checkListings([AI], deps({ signals: [broken] }));
    expect(verdicts[0]).toMatchObject({ listingId: AI, level: "unclear", reasons: [] });
  });
});
