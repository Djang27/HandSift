import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { onCheckListings } from "../adapters/messaging/bus";
import { withLogging } from "../adapters/source/loggingSource";
import { createWorkerSource } from "../adapters/source/workerSource";
import { createMemoryStore } from "../adapters/storage/memoryStore";
import { checkListings } from "../core/pipeline";
import { unscored } from "../core/scoring/unscored";
import { SIGNALS } from "../core/signals";

// Wiring only. Memory store until Phase 5 (Dexie); unscored until Phase 6 (scoring).
export default defineBackground(() => {
  const source = withLogging(
    createWorkerSource({
      baseUrl: import.meta.env.WXT_WORKER_URL,
      version: browser.runtime.getManifest().version,
    }),
  );
  const deps = {
    store: createMemoryStore(),
    source,
    signals: SIGNALS,
    score: unscored,
    now: Date.now,
  };
  onCheckListings((ids) => checkListings(ids, deps));
});
