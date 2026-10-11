import {
  DEFAULT_SETTINGS,
  DisplayModeSchema,
  SensitivitySchema,
  SettingsSchema,
  type Settings,
} from "@handsift/shared";
import { browser } from "wxt/browser";
import { z } from "zod";

// Settings in chrome.storage.sync (synced across the user's browsers).

const KEY = "settings";

export interface StorageApi {
  sync: Pick<typeof browser.storage.sync, "get" | "set">;
  onChanged: Pick<typeof browser.storage.onChanged, "addListener" | "removeListener">;
}

export interface SettingsStore {
  get(): Promise<Settings>;
  /** Validates and saves; returns the saved settings (unchanged if the patch is invalid). */
  update(patch: Partial<Settings>): Promise<Settings>;
  /** Calls `listener` whenever settings change (in any context). Returns an unsubscribe. */
  onChange(listener: (settings: Settings) => void): () => void;
}

const StoredObjectSchema = z.record(z.string(), z.unknown());

/** Reads stored settings field by field; anything missing or invalid falls back to its default. */
export function parseSettings(raw: unknown): Settings {
  const stored = StoredObjectSchema.safeParse(raw).data ?? {};
  return {
    enabled: z.boolean().safeParse(stored.enabled).data ?? DEFAULT_SETTINGS.enabled,
    mode: DisplayModeSchema.safeParse(stored.mode).data ?? DEFAULT_SETTINGS.mode,
    sensitivity:
      SensitivitySchema.safeParse(stored.sensitivity).data ?? DEFAULT_SETTINGS.sensitivity,
  };
}

export function createSettingsStore(storage: StorageApi = browser.storage): SettingsStore {
  async function get(): Promise<Settings> {
    try {
      const stored: Record<string, unknown> = await storage.sync.get(KEY);
      return parseSettings(stored[KEY]);
    } catch (error) {
      console.warn("[HandSift] Reading settings failed", error);
      return DEFAULT_SETTINGS;
    }
  }

  return {
    get,

    async update(patch) {
      const current = await get();
      const next = SettingsSchema.safeParse({ ...current, ...patch });
      if (!next.success) {
        console.warn("[HandSift] Ignoring invalid settings", next.error.issues);
        return current;
      }
      try {
        await storage.sync.set({ [KEY]: next.data });
        return next.data;
      } catch (error) {
        console.warn("[HandSift] Saving settings failed", error);
        return current;
      }
    },

    onChange(listener) {
      const onStorageChanged: Parameters<StorageApi["onChanged"]["addListener"]>[0] = (
        changes,
        areaName,
      ) => {
        const change = changes[KEY];
        if (areaName !== "sync" || change === undefined) return;
        const newValue: unknown = change.newValue;
        listener(parseSettings(newValue));
      };
      storage.onChanged.addListener(onStorageChanged);
      return () => {
        storage.onChanged.removeListener(onStorageChanged);
      };
    },
  };
}
