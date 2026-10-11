import { DEFAULT_SETTINGS, type Settings } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import { createSettingsStore, parseSettings, type StorageApi } from "./settings";

type ChangeListener = Parameters<StorageApi["onChanged"]["addListener"]>[0];

/** In-memory stand-in for chrome.storage.sync that fires onChanged like Chrome does. */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const listeners = new Set<ChangeListener>();
  const storage = {
    sync: {
      get: vi.fn((key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {})),
      set: vi.fn((items: Record<string, unknown>) => {
        const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const [key, newValue] of Object.entries(items)) {
          changes[key] = { oldValue: data[key], newValue };
          data[key] = newValue;
        }
        for (const l of listeners) l(changes, "sync");
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: (l: ChangeListener) => listeners.add(l),
      removeListener: (l: ChangeListener) => listeners.delete(l),
    },
  } as unknown as StorageApi;
  return { storage, data, listeners };
}

describe("parseSettings", () => {
  it("falls back to defaults for missing data", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("garbage")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and replaces only the invalid ones", () => {
    expect(parseSettings({ enabled: false, mode: "sparkles", sensitivity: "balanced" })).toEqual({
      enabled: false,
      mode: DEFAULT_SETTINGS.mode,
      sensitivity: "balanced",
    });
  });
});

describe("settings store", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await createSettingsStore(fakeStorage().storage).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("saves valid updates, merged with the current settings", async () => {
    const { storage, data } = fakeStorage();
    const store = createSettingsStore(storage);
    const saved = await store.update({ mode: "blur" });
    expect(saved).toEqual({ ...DEFAULT_SETTINGS, mode: "blur" });
    expect(data.settings).toEqual(saved);
    expect(await store.get()).toEqual(saved);
  });

  it("rejects invalid updates without saving", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage } = fakeStorage();
    const store = createSettingsStore(storage);
    const result = await store.update({ mode: "sparkles" } as unknown as Partial<Settings>);
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(storage.sync.set).not.toHaveBeenCalled();
  });

  it("notifies listeners of changes until unsubscribed", async () => {
    const { storage } = fakeStorage();
    const store = createSettingsStore(storage);
    const listener = vi.fn();
    const stop = store.onChange(listener);

    await store.update({ enabled: false });
    expect(listener).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, enabled: false });

    stop();
    await store.update({ enabled: true });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("uses defaults if storage fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage } = fakeStorage();
    vi.mocked(storage.sync.get).mockRejectedValue(new Error("quota"));
    expect(await createSettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
  });
});
