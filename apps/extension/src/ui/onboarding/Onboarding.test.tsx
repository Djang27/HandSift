// @vitest-environment jsdom
import {
  DEFAULT_SETTINGS,
  PRIVACY_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
  TERMS_VERSION,
  type Settings,
} from "@handsift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SettingsStore } from "../../adapters/storage/settings";
import { Onboarding } from "./Onboarding";

function fakeSettings(initial: Partial<Settings> = {}, { saves = true } = {}) {
  let current: Settings = { ...DEFAULT_SETTINGS, ...initial };
  const update = vi.fn((patch: Partial<Settings>) => {
    if (saves) current = { ...current, ...patch };
    return Promise.resolve(current);
  });
  const store: SettingsStore = {
    get: () => Promise.resolve(current),
    update,
    onChange: () => () => undefined,
  };
  return { store, update };
}

function setup(settings = fakeSettings()) {
  render(<Onboarding settings={settings.store} />);
  return { update: settings.update, user: userEvent.setup() };
}

const startButton = () => screen.getByRole("button", { name: "Start using HandSift" });

describe("Onboarding", () => {
  it("links the terms, privacy policy, and support email", async () => {
    setup();
    await screen.findByRole("checkbox");
    expect(screen.getByRole("link", { name: "Terms of Use" }).getAttribute("href")).toBe(TERMS_URL);
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe(
      PRIVACY_URL,
    );
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL }).getAttribute("href")).toBe(
      `mailto:${SUPPORT_EMAIL}`,
    );
    expect(screen.getByText(/not endorsed or certified by Etsy/)).toBeTruthy();
  });

  it("can't be accepted until the box is ticked", async () => {
    const { update, user } = setup();
    const checkbox = await screen.findByRole("checkbox", { name: /I agree/ });
    expect(startButton().matches(":disabled")).toBe(true);

    await user.click(checkbox);
    expect(startButton().matches(":disabled")).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves the current terms version and confirms", async () => {
    const { update, user } = setup();
    await user.click(await screen.findByRole("checkbox", { name: /I agree/ }));
    await user.click(startButton());
    expect(update).toHaveBeenCalledExactlyOnceWith({ termsAcceptedVersion: TERMS_VERSION });
    expect(await screen.findByText("You're all set")).toBeTruthy();
  });

  it("says so if saving fails", async () => {
    const { user } = setup(fakeSettings({}, { saves: false }));
    await user.click(await screen.findByRole("checkbox", { name: /I agree/ }));
    await user.click(startButton());
    expect(await screen.findByText(/Couldn't save your choice/)).toBeTruthy();
  });

  it("shows the done state if the terms were already accepted", async () => {
    setup(fakeSettings({ termsAcceptedVersion: TERMS_VERSION }));
    expect(await screen.findByText("You're all set")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
