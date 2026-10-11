import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { onCheckListings } from "../adapters/messaging/bus";
import { withLogging } from "../adapters/source/loggingSource";
import { createWorkerSource } from "../adapters/source/workerSource";
import { createDexieStore } from "../adapters/storage/dexieStore";
import { checkListings } from "../core/pipeline";
import { score } from "../core/scoring/score";
import { SIGNALS } from "../core/signals";

// Wiring only.
export default defineBackground(() => {
  const source = withLogging(
    createWorkerSource({
      baseUrl: import.meta.env.WXT_WORKER_URL,
      version: browser.runtime.getManifest().version,
    }),
  );
  const deps = {
    store: createDexieStore(),
    source,
    signals: SIGNALS,
    score,
    now: Date.now,
  };
  onCheckListings((ids) => checkListings(ids, deps));
});
