// @vitest-environment jsdom
import { DEFAULT_SETTINGS, type CheckListingsReply, type Settings } from "@handsift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { etsyAdapter } from "../adapters/sites/etsy/etsyAdapter";
import type { SettingsStore } from "../adapters/storage/settings";
import { startContentApp, type ContentAppDeps } from "./contentApp";

const REPLY: CheckListingsReply = {
  verdicts: [{ listingId: "1", level: "disclosed_ai", score: 1, reasons: ["r"], checkedAt: 1 }],
  unavailable: [],
};

function fakeSettings(initial: Partial<Settings> = {}) {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const listeners = new Set<(s: Settings) => void>();
  const store: SettingsStore = {
    get: () => Promise.resolve(current),
    update: (patch) => {
      current = { ...current, ...patch };
      for (const l of listeners) l(current);
      return Promise.resolve(current);
    },
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return store;
}

function deps(overrides: Partial<ContentAppDeps> = {}): ContentAppDeps {
  return {
    doc: document,
    adapter: etsyAdapter,
    settings: fakeSettings(),
    checkListings: vi.fn().mockResolvedValue(REPLY),
    onGetPageStats: vi.fn(() => () => undefined),
    ...overrides,
  };
}

describe("startContentApp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.body.innerHTML = `<ul><li><div data-listing-card-v2 data-listing-id="1"><img></div></li><li><div data-listing-card-v2 data-listing-id="2"><img></div></li></ul>`;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks every listing on the page in one batch and badges flagged ones", async () => {
    const d = deps();
    await startContentApp(d);
    await vi.runAllTimersAsync();
    expect(d.checkListings).toHaveBeenCalledExactlyOnceWith(["1", "2"]);
    expect(document.querySelector('[data-listing-id="1"] handsift-badge')).not.toBeNull();
    expect(document.querySelector('[data-listing-id="2"] handsift-badge')).toBeNull();
  });

  it("requests nothing while turned off, and starts when turned on", async () => {
    const settings = fakeSettings({ enabled: false });
    const d = deps({ settings });
    await startContentApp(d);
    await vi.runAllTimersAsync();
    expect(d.checkListings).not.toHaveBeenCalled();

    await settings.update({ enabled: true });
    await vi.runAllTimersAsync();
    expect(d.checkListings).toHaveBeenCalledOnce();
  });

  it("answers the popup's stats request", async () => {
    let statsHandler: (() => unknown) | undefined;
    const d = deps({
      onGetPageStats: (h) => {
        statsHandler = h;
        return () => undefined;
      },
    });
    await startContentApp(d);
    await vi.runAllTimersAsync();
    expect(statsHandler?.()).toEqual({ checked: 1, disclosed: 1, likely: 0 }); // only listing 1 has a verdict
  });

  it("retries listings that came back unavailable", async () => {
    const checkListings = vi
      .fn()
      .mockResolvedValueOnce({ verdicts: [], unavailable: ["1", "2"] })
      .mockResolvedValue(REPLY);
    await startContentApp(deps({ checkListings }));
    await vi.runAllTimersAsync();
    // New cards for the same listings (e.g. Etsy re-rendered) are asked about again.
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-listing-card-v2 data-listing-id="1"></div>`,
    );
    await vi.runAllTimersAsync();
    expect(checkListings).toHaveBeenCalledTimes(2);
  });
});
