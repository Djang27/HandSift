import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { openOnboardingTab } from "../adapters/browser/onboardingTab";
import { onCheckListings, onClearCache } from "../adapters/messaging/bus";
import { withLogging } from "../adapters/source/loggingSource";
import { createWorkerSource } from "../adapters/source/workerSource";
import { createDexieStore } from "../adapters/storage/dexieStore";
import { createSettingsStore } from "../adapters/storage/settings";
import { requireConsent, shouldShowOnboarding } from "../core/consent";
import { checkListings } from "../core/pipeline";
import { score } from "../core/scoring/score";
import { SIGNALS } from "../core/signals";

// Wiring only.
export default defineBackground(() => {
  const store = createDexieStore();
  const settings = createSettingsStore();
  const source = withLogging(
    createWorkerSource({
      baseUrl: import.meta.env.WXT_WORKER_URL,
      version: browser.runtime.getManifest().version,
    }),
  );
  const deps = { store, source, signals: SIGNALS, score, now: Date.now };
  onCheckListings(
    requireConsent(
      (ids) => checkListings(ids, deps),
      () => settings.get(),
    ),
  );
  onClearCache(() => store.clear());

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void settings.get().then((current) => {
      if (shouldShowOnboarding(reason, current)) void openOnboardingTab();
    });
  });
});
