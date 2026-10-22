import { TERMS_VERSION, type Settings } from "@handsift/shared";

/** The user has accepted the current terms and privacy policy. */
export function hasConsented(settings: Settings): boolean {
  return settings.termsAcceptedVersion >= TERMS_VERSION;
}

/** HandSift may check listings: turned on and current terms accepted. */
export function isActive(settings: Settings): boolean {
  return settings.enabled && hasConsented(settings);
}
