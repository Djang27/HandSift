import { DEFAULT_SETTINGS, TERMS_VERSION } from "@handsift/shared";
import { describe, expect, it } from "vitest";
import { hasConsented, isActive } from "./consent";

describe("consent", () => {
  it("is not given by default (fresh install)", () => {
    expect(hasConsented(DEFAULT_SETTINGS)).toBe(false);
    expect(isActive(DEFAULT_SETTINGS)).toBe(false);
  });

  it("requires the current terms version", () => {
    expect(hasConsented({ ...DEFAULT_SETTINGS, termsAcceptedVersion: TERMS_VERSION - 1 })).toBe(
      false,
    );
    expect(hasConsented({ ...DEFAULT_SETTINGS, termsAcceptedVersion: TERMS_VERSION })).toBe(true);
  });

  it("is active only when turned on and consented", () => {
    const consented = { ...DEFAULT_SETTINGS, termsAcceptedVersion: TERMS_VERSION };
    expect(isActive(consented)).toBe(true);
    expect(isActive({ ...consented, enabled: false })).toBe(false);
  });
});
