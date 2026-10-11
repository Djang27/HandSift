// @vitest-environment jsdom
import { DEFAULT_SETTINGS, type Settings } from "@handsift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SettingsStore } from "../../adapters/storage/settings";
import { Popup, type PopupProps } from "./Popup";

function fakeSettings(initial: Partial<Settings> = {}) {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const update = vi.fn((patch: Partial<Settings>) => {
    current = { ...current, ...patch };
    return Promise.resolve(current);
  });
  const store: SettingsStore = {
    get: () => Promise.resolve(current),
    update,
    onChange: () => () => undefined,
  };
  return { store, update };
}

function setup(overrides: Partial<PopupProps> = {}, settings = fakeSettings()) {
  const clearCache = vi.fn().mockResolvedValue({ cleared: true });
  render(
    <Popup
      settings={settings.store}
      clearCache={clearCache}
      getPageStats={vi.fn().mockResolvedValue({ checked: 46, disclosed: 3, likely: 1 })}
      {...overrides}
    />,
  );
  return { update: settings.update, clearCache, user: userEvent.setup() };
}

describe("Popup", () => {
  it("shows the saved settings", async () => {
    setup({}, fakeSettings({ mode: "blur", sensitivity: "balanced" }));
    expect(
      await screen.findByRole("radio", { name: "Blur the photo", checked: true }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Balanced/, checked: true })).toBeTruthy();
    expect(screen.getByRole("switch", { checked: true })).toBeTruthy();
  });

  it("saves mode and sensitivity changes", async () => {
    const { update, user } = setup();
    await user.click(await screen.findByRole("radio", { name: "Hide it" }));
    expect(update).toHaveBeenCalledWith({ mode: "hide" });
    await user.click(screen.getByRole("radio", { name: /Aggressive/ }));
    expect(update).toHaveBeenCalledWith({ sensitivity: "aggressive" });
  });

  it("turning off disables the other settings", async () => {
    const { update, user } = setup();
    await user.click(await screen.findByRole("switch"));
    expect(update).toHaveBeenCalledWith({ enabled: false });
    expect(await screen.findByText("Off")).toBeTruthy();
    // Disabled through the surrounding <fieldset>, as the browser applies it.
    expect(screen.getByRole("radio", { name: "Label it" }).matches(":disabled")).toBe(true);
  });

  it("shows what was found on this page", async () => {
    setup();
    expect((await screen.findByLabelText("This page")).textContent).toContain(
      "46 checked · 3 disclosed AI · 1 likely AI",
    );
  });

  it("shows a hint when the active tab isn't an Etsy page", async () => {
    setup({ getPageStats: vi.fn().mockResolvedValue(null) });
    expect(await screen.findByText(/Open an Etsy search or shop page/)).toBeTruthy();
  });

  it("clears the cache and confirms", async () => {
    const { clearCache, user } = setup();
    await user.click(screen.getByRole("button", { name: "Clear cache" }));
    expect(clearCache).toHaveBeenCalledOnce();
    expect((await screen.findByRole("status")).textContent).toBe("Cache cleared");
  });

  it("shows Etsy's required trademark notice and the disclosed/likely legend", () => {
    setup();
    expect(
      screen.getByText(
        "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/estimate, which can be wrong/)).toBeTruthy();
  });
});
