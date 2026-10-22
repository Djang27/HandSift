import { TERMS_VERSION, type CheckListingsReply, type Settings } from "@handsift/shared";

/** The user has accepted the current terms and privacy policy. */
export function hasConsented(settings: Settings): boolean {
  return settings.termsAcceptedVersion >= TERMS_VERSION;
}

/** HandSift may check listings: turned on and current terms accepted. */
export function isActive(settings: Settings): boolean {
  return settings.enabled && hasConsented(settings);
}

/**
 * Open the welcome page after an install, or after an update that changed the terms, unless
 * the current terms are already accepted (e.g. synced from another browser).
 * `reason` is chrome.runtime.onInstalled's ("install", "update", "chrome_update", ...).
 */
export function shouldShowOnboarding(reason: string, settings: Settings): boolean {
  return (reason === "install" || reason === "update") && !hasConsented(settings);
}

/**
 * Wraps a listings check so it refuses (every ID unavailable, no verdicts) unless HandSift
 * is active. The content script already waits for consent; this is the second safeguard.
 */
export function requireConsent(
  check: (ids: string[]) => Promise<CheckListingsReply>,
  getSettings: () => Promise<Settings>,
): (ids: string[]) => Promise<CheckListingsReply> {
  return async (ids) =>
    isActive(await getSettings()) ? check(ids) : { verdicts: [], unavailable: ids };
}
