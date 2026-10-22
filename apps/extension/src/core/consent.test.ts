import { DEFAULT_SETTINGS, TERMS_VERSION, type CheckListingsReply } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import { hasConsented, isActive, requireConsent, shouldShowOnboarding } from "./consent";

const CONSENTED = { ...DEFAULT_SETTINGS, termsAcceptedVersion: TERMS_VERSION };

describe("consent", () => {
  it("is not given by default (fresh install)", () => {
    expect(hasConsented(DEFAULT_SETTINGS)).toBe(false);
    expect(isActive(DEFAULT_SETTINGS)).toBe(false);
  });

  it("requires the current terms version", () => {
    expect(hasConsented({ ...DEFAULT_SETTINGS, termsAcceptedVersion: TERMS_VERSION - 1 })).toBe(
      false,
    );
    expect(hasConsented(CONSENTED)).toBe(true);
  });

  it("is active only when turned on and consented", () => {
    expect(isActive(CONSENTED)).toBe(true);
    expect(isActive({ ...CONSENTED, enabled: false })).toBe(false);
  });
});

describe("shouldShowOnboarding", () => {
  it("shows after an install or update until the current terms are accepted", () => {
    expect(shouldShowOnboarding("install", DEFAULT_SETTINGS)).toBe(true);
    expect(shouldShowOnboarding("update", DEFAULT_SETTINGS)).toBe(true);
    expect(shouldShowOnboarding("install", CONSENTED)).toBe(false);
    expect(shouldShowOnboarding("update", CONSENTED)).toBe(false);
  });

  it("ignores browser updates", () => {
    expect(shouldShowOnboarding("chrome_update", DEFAULT_SETTINGS)).toBe(false);
  });
});

describe("requireConsent", () => {
  const reply: CheckListingsReply = { verdicts: [], unavailable: [] };

  it("runs the check when active", async () => {
    const check = vi.fn().mockResolvedValue(reply);
    const guarded = requireConsent(check, () => Promise.resolve(CONSENTED));
    expect(await guarded(["1"])).toBe(reply);
    expect(check).toHaveBeenCalledWith(["1"]);
  });

  it("refuses without consent, marking every ID unavailable", async () => {
    const check = vi.fn().mockResolvedValue(reply);
    const guarded = requireConsent(check, () => Promise.resolve(DEFAULT_SETTINGS));
    expect(await guarded(["1", "2"])).toEqual({ verdicts: [], unavailable: ["1", "2"] });
    expect(check).not.toHaveBeenCalled();
  });
});
