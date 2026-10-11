import "fake-indexeddb/auto";
import { VERDICT_PRUNE_INTERVAL_MS, VERDICT_TTL_MS, type Verdict } from "@handsift/shared";
import Dexie from "dexie";
import { describe, expect, it, vi } from "vitest";
import { createDexieStore } from "./dexieStore";

const NOW = 1_800_000_000_000;

const verdict = (id: string, checkedAt = NOW): Verdict => ({
  listingId: id,
  level: "clean",
  score: 0,
  reasons: [],
  checkedAt,
});

function setup(now: () => number = () => NOW) {
  const dbName = `test-${crypto.randomUUID()}`;
  return { dbName, store: createDexieStore({ dbName, now }) };
}

describe("dexieStore", () => {
  it("round-trips verdicts and returns only what exists", async () => {
    const { store } = setup();
    await store.put([verdict("1"), verdict("2")]);
    const found = await store.get(["1", "3"]);
    expect([...found.entries()]).toEqual([["1", verdict("1")]]);
  });

  it("persists across store instances (service worker restarts)", async () => {
    const { dbName, store } = setup();
    await store.put([verdict("1")]);
    const reopened = createDexieStore({ dbName, now: () => NOW });
    expect((await reopened.get(["1"])).get("1")).toEqual(verdict("1"));
  });

  it("ignores rows that fail validation", async () => {
    const { dbName, store } = setup();
    await store.put([verdict("1")]);
    const raw = new Dexie(dbName);
    raw.version(2).stores({ verdicts: "listingId, checkedAt" });
    await raw.table("verdicts").put({ listingId: "2", level: "nonsense", checkedAt: NOW });
    raw.close();
    expect([...(await store.get(["1", "2"])).keys()]).toEqual(["1"]);
  });

  it("deletes expired verdicts, at most once per prune interval", async () => {
    let now = NOW;
    const { store } = setup(() => now);
    await store.put([verdict("old", NOW - VERDICT_TTL_MS - 1), verdict("fresh")]);
    // First put pruned at startup time, before "old" existed; next prune waits for the interval.
    expect((await store.get(["old"])).size).toBe(1);

    now = NOW + VERDICT_PRUNE_INTERVAL_MS;
    await store.put([verdict("another", now)]);
    expect((await store.get(["old"])).size).toBe(0);
    expect((await store.get(["fresh"])).size).toBe(1);
  });

  it("clears verdicts saved by the interim scorer when upgrading from v1", async () => {
    const dbName = `test-${crypto.randomUUID()}`;
    const v1 = new Dexie(dbName);
    v1.version(1).stores({ verdicts: "listingId, checkedAt" });
    await v1.table("verdicts").put(verdict("old-unclear"));
    v1.close();

    const store = createDexieStore({ dbName, now: () => NOW });
    expect((await store.get(["old-unclear"])).size).toBe(0);
  });

  it("clears everything", async () => {
    const { store } = setup();
    await store.put([verdict("1")]);
    await store.clear();
    expect((await store.get(["1"])).size).toBe(0);
  });

  it("logs and acts like a cache miss when IndexedDB fails, never throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { dbName, store } = setup();
    await store.put([verdict("1")]);
    // A real failure: deleting the database closes the store's connection.
    await Dexie.delete(dbName);

    await expect(store.get(["1"])).resolves.toEqual(new Map());
    await expect(store.put([verdict("2")])).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
