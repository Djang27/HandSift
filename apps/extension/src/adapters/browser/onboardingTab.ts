import { browser } from "wxt/browser";

/** Opens HandSift's welcome page (what it does, terms + privacy consent) in a new tab. */
export async function openOnboardingTab(): Promise<void> {
  try {
    await browser.tabs.create({ url: browser.runtime.getURL("/onboarding.html") });
  } catch (error) {
    console.warn("[HandSift] Opening the welcome page failed", error);
  }
}
