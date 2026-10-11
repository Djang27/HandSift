import {
  BATCH_DELAY_MS,
  MAX_IDS_PER_REQUEST,
  type CheckListingsReply,
  type PageStats,
} from "@handsift/shared";
import type { SiteAdapter } from "@handsift/shared/interfaces";
import { observePageItems } from "../adapters/page/observePageItems";
import type { SettingsStore } from "../adapters/storage/settings";
import { createBatchQueue } from "../core/batchQueue";
import { createPageController } from "./pageController";

export interface ContentAppDeps {
  doc: Document;
  adapter: SiteAdapter;
  settings: SettingsStore;
  checkListings: (ids: string[]) => Promise<CheckListingsReply | null>;
  onGetPageStats: (handler: () => PageStats) => () => void;
}

/**
 * Runs HandSift on one page: watches items while enabled (nothing is requested while
 * off), batches their IDs to the service worker, and renders verdicts. Returns a stop
 * function.
 */
export async function startContentApp(deps: ContentAppDeps): Promise<() => void> {
  const initial = await deps.settings.get();
  const controller = createPageController(deps.adapter, initial);

  const queue = createBatchQueue({
    delayMs: BATCH_DELAY_MS,
    maxSize: MAX_IDS_PER_REQUEST,
    flush: async (ids) => {
      const reply = await deps.checkListings(ids);
      if (reply === null) {
        queue.release(ids);
        return;
      }
      queue.release(reply.unavailable);
      controller.applyVerdicts(reply.verdicts);
    },
  });

  let stopObserving: (() => void) | null = null;
  const startObserving = () => {
    stopObserving ??= observePageItems(deps.doc, deps.adapter, (id, el) => {
      controller.addItem(id, el);
      queue.add(id);
    });
  };
  const pause = () => {
    stopObserving?.();
    stopObserving = null;
    queue.stop();
  };

  if (initial.enabled) startObserving();
  const unsubscribeSettings = deps.settings.onChange((next) => {
    controller.setSettings(next);
    if (next.enabled) startObserving();
    else pause();
  });
  const unsubscribeStats = deps.onGetPageStats(() => controller.stats());

  return () => {
    pause();
    unsubscribeSettings();
    unsubscribeStats();
  };
}
