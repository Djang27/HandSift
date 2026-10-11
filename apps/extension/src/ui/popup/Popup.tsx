import {
  DEFAULT_SETTINGS,
  type ClearCacheReply,
  type DisplayMode,
  type PageStats,
  type Sensitivity,
  type Settings,
} from "@handsift/shared";
import { useEffect, useState } from "react";
import type { SettingsStore } from "../../adapters/storage/settings";
import { ChoiceGroup } from "./ChoiceGroup";

export interface PopupProps {
  settings: SettingsStore;
  clearCache: () => Promise<ClearCacheReply | null>;
  /** Stats from the active tab, or null if it isn't an Etsy page. */
  getPageStats: () => Promise<PageStats | null>;
}

const MODES: { value: DisplayMode; label: string }[] = [
  { value: "label", label: "Label it" },
  { value: "blur", label: "Blur the photo" },
  { value: "hide", label: "Hide it" },
];

const SENSITIVITIES: { value: Sensitivity; label: string; hint: string }[] = [
  { value: "conservative", label: "Conservative", hint: "Only strong evidence (recommended)" },
  { value: "balanced", label: "Balanced", hint: "More flags" },
  { value: "aggressive", label: "Aggressive", hint: "Most flags, most mistakes" },
];

const ETSY_NOTICE =
  "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";

export function Popup({ settings, clearCache, getPageStats }: PopupProps) {
  const [current, setCurrent] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<PageStats | null | undefined>(undefined);
  const [cacheStatus, setCacheStatus] = useState<string>("");

  useEffect(() => {
    void settings.get().then(setCurrent);
    void getPageStats().then(setStats);
    return settings.onChange(setCurrent);
  }, [settings, getPageStats]);

  const update = (patch: Partial<Settings>) => {
    void settings.update(patch).then(setCurrent);
  };

  return (
    <main className="popup">
      <header className="popup__header">
        <h1>HandSift</h1>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={current.enabled}
            onChange={(e) => {
              update({ enabled: e.target.checked });
            }}
          />
          <span>{current.enabled ? "On" : "Off"}</span>
        </label>
      </header>

      <fieldset className="popup__settings" disabled={!current.enabled}>
        <ChoiceGroup
          legend="When a listing is flagged"
          name="mode"
          options={MODES}
          value={current.mode}
          onChange={(mode) => {
            update({ mode });
          }}
        />
        <ChoiceGroup
          legend="Flag likely-AI listings"
          name="sensitivity"
          options={SENSITIVITIES}
          value={current.sensitivity}
          onChange={(sensitivity) => {
            update({ sensitivity });
          }}
          note="Listings whose sellers disclose AI are always flagged."
        />
      </fieldset>

      <section className="popup__stats" aria-label="This page">
        <h2>This page</h2>
        {stats === undefined ? null : stats === null ? (
          <p>Open an Etsy search or shop page to see what HandSift found.</p>
        ) : (
          <p>
            {stats.checked} checked · <strong>{stats.disclosed}</strong> disclosed AI ·{" "}
            <strong>{stats.likely}</strong> likely AI
          </p>
        )}
      </section>

      <section className="popup__cache">
        <button
          type="button"
          onClick={() => {
            void clearCache().then((reply) => {
              setCacheStatus(reply?.cleared ? "Cache cleared" : "Couldn't clear the cache");
            });
          }}
        >
          Clear cache
        </button>
        <span role="status">{cacheStatus}</span>
      </section>

      <footer className="popup__footer">
        <p>
          <strong>Disclosed</strong> = the seller said so. <strong>Likely</strong> = HandSift's
          estimate, which can be wrong.
        </p>
        <p className="popup__notice">{ETSY_NOTICE}</p>
      </footer>
    </main>
  );
}
