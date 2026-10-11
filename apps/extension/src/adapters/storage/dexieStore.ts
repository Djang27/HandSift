import {
  VERDICT_PRUNE_INTERVAL_MS,
  VERDICT_TTL_MS,
  VerdictSchema,
  type Verdict,
} from "@handsift/shared";
import type { VerdictStore } from "@handsift/shared/interfaces";
import Dexie, { type EntityTable } from "dexie";

class HandSiftDb extends Dexie {
  verdicts!: EntityTable<Verdict, "listingId">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ verdicts: "listingId, checkedAt" });
  }
}

export interface DexieStoreOptions {
  dbName?: string;
  now?: () => number;
}

/**
 * VerdictStore in IndexedDB (via Dexie), so verdicts survive service worker restarts.
 * Reads are validated; invalid rows are ignored. Expired verdicts are deleted on startup
 * and at most every VERDICT_PRUNE_INTERVAL_MS after that. Errors are logged, never thrown:
 * a storage failure just means a cache miss.
 */
export function createDexieStore(options: DexieStoreOptions = {}): VerdictStore {
  const db = new HandSiftDb(options.dbName ?? "handsift");
  const now = options.now ?? Date.now;
  let lastPrune = -Infinity;

  async function pruneIfDue(): Promise<void> {
    const t = now();
    if (t - lastPrune < VERDICT_PRUNE_INTERVAL_MS) return;
    lastPrune = t;
    try {
      await db.verdicts
        .where("checkedAt")
        .below(t - VERDICT_TTL_MS)
        .delete();
    } catch (error) {
      console.warn("[HandSift] Pruning verdicts failed", error);
    }
  }

  void pruneIfDue();

  return {
    async get(ids) {
      const found = new Map<string, Verdict>();
      try {
        for (const row of await db.verdicts.bulkGet([...ids])) {
          const parsed = VerdictSchema.safeParse(row);
          if (parsed.success) found.set(parsed.data.listingId, parsed.data);
        }
      } catch (error) {
        console.warn("[HandSift] Reading verdicts failed", error);
      }
      return found;
    },

    async put(verdicts) {
      try {
        await db.verdicts.bulkPut([...verdicts]);
      } catch (error) {
        console.warn("[HandSift] Saving verdicts failed", error);
      }
      await pruneIfDue();
    },

    async clear() {
      try {
        await db.verdicts.clear();
      } catch (error) {
        console.warn("[HandSift] Clearing verdicts failed", error);
      }
    },
  };
}
