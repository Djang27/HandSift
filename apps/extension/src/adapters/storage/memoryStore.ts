import type { Verdict } from "@handsift/shared";
import type { VerdictStore } from "@handsift/shared/interfaces";

/**
 * In-memory VerdictStore. Used by the service worker until Phase 5's Dexie store, and by
 * tests. Contents are lost when the service worker stops.
 */
export function createMemoryStore(): VerdictStore {
  const verdicts = new Map<string, Verdict>();
  return {
    get(ids) {
      return Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const verdict = verdicts.get(id);
            return verdict ? [[id, verdict] as const] : [];
          }),
        ),
      );
    },
    put(items) {
      for (const verdict of items) verdicts.set(verdict.listingId, verdict);
      return Promise.resolve();
    },
    clear() {
      verdicts.clear();
      return Promise.resolve();
    },
  };
}
