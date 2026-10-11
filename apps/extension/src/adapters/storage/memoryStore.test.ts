import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memoryStore";

const verdict = (id: string) => ({
  listingId: id,
  level: "clean" as const,
  score: 0,
  reasons: [],
  checkedAt: 1,
});

describe("memoryStore", () => {
  it("puts, gets only what exists, and clears", async () => {
    const store = createMemoryStore();
    await store.put([verdict("1"), verdict("2")]);
    expect([...(await store.get(["1", "3"])).keys()]).toEqual(["1"]);
    await store.clear();
    expect((await store.get(["1", "2"])).size).toBe(0);
  });
});
