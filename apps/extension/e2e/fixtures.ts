import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { startMockWorker, type MockWorker } from "./mockWorker";

// Playwright fixtures: a fresh Chromium profile with HandSift installed (built by
// `pnpm test:e2e`), a mock Worker, and helpers for the pages a user sees.

const EXTENSION_DIR = join(import.meta.dirname, "../.output/chrome-mv3-e2e");
const SEARCH_PAGE = join(
  import.meta.dirname,
  "../../../fixtures/synthetic/search-pages/search-results.html",
);
export const ETSY_SEARCH_URL = "https://www.etsy.com/search?q=wall+art";

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  mockWorker: MockWorker;
}>({
  // Started for every test (auto), so the extension always has a Worker to talk to.
  mockWorker: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring.
    async ({}, use) => {
      const worker = await startMockWorker();
      await use(worker);
      await worker.close();
    },
    { auto: true },
  ],

  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring.
  context: async ({}, use) => {
    if (!existsSync(EXTENSION_DIR)) {
      throw new Error(`No e2e build at ${EXTENSION_DIR}. Run \`pnpm test:e2e\`.`);
    }
    // Extensions need the full Chromium build ("chromium" channel), which also runs headless.
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    // Serve the synthetic search page at a real Etsy URL so the content script runs on it.
    const html = readFileSync(SEARCH_PAGE, "utf8");
    await context.route("https://www.etsy.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    await use(id);
  },
});

export { expect };

/** The open tab whose URL ends with `path` (waits for it to appear). */
export async function findPage(context: BrowserContext, path: string): Promise<Page> {
  const find = () => context.pages().find((p) => new URL(p.url()).pathname === path);
  await expect.poll(() => find() !== undefined, { message: `a tab at ${path}` }).toBe(true);
  const page = find();
  if (!page) throw new Error(`No tab at ${path}`);
  return page;
}

export async function openEtsySearch(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(ETSY_SEARCH_URL);
  return page;
}

/** Ticks "I agree" and starts HandSift on the welcome page. */
export async function acceptTerms(welcome: Page): Promise<void> {
  await welcome.getByRole("checkbox", { name: /I agree/ }).check();
  await welcome.getByRole("button", { name: "Start using HandSift" }).click();
  await expect(welcome.getByText("You're all set")).toBeVisible();
}

/** Locator for one listing's cards (a listing can appear more than once on a page). */
export function cards(page: Page, listingId: string) {
  return page.locator(`[data-listing-card-v2][data-listing-id="${listingId}"]`);
}
