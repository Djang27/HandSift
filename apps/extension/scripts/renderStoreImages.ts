// Renders the Chrome Web Store images into store/images/: three 1280x800 screenshots of the
// real extension (e2e build + mock Worker) on a neutral demo results page, and the 440x280
// promo tile.
//
//   pnpm --filter @handsift/extension store:images
//
// The demo page (store/demo/search.html) is served at an etsy.com URL so the content script
// runs on it, exactly as in the e2e tests. No Etsy data or pages are involved.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { startMockWorker } from "../e2e/mockWorker";

const ROOT = join(import.meta.dirname, "../../..");
const EXTENSION_DIR = join(ROOT, "apps/extension/.output/chrome-mv3-e2e");
const OUT = join(ROOT, "store/images");
const DEMO = readFileSync(join(ROOT, "store/demo/search.html"), "utf8");
const LOGO = readFileSync(join(ROOT, "branding/logo.svg"), "utf8");
const SIZE = { width: 1280, height: 800 };

const demoUrl = (caption: string) =>
  `https://www.etsy.com/search?caption=${encodeURIComponent(caption)}`;

async function findPage(context: BrowserContext, path: string): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const page = context.pages().find((p) => new URL(p.url()).pathname === path);
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No tab at ${path}`);
}

/** Waits until `count` cards carry a disclosed badge. */
async function waitForBadges(page: Page, count: number): Promise<void> {
  const badges = page.getByRole("button", { name: "AI · disclosed" });
  await badges.first().waitFor();
  while ((await badges.count()) < count) await page.waitForTimeout(100);
}

async function screenshotWelcome(welcome: Page): Promise<void> {
  await welcome.setViewportSize(SIZE);
  await welcome.screenshot({ path: join(OUT, "screenshot-3-welcome.png") });
}

async function screenshotLabel(etsy: Page): Promise<void> {
  await etsy.goto(demoUrl("See which listings are AI, and exactly why"));
  await waitForBadges(etsy, 3);
  await etsy.getByRole("button", { name: "AI · disclosed" }).nth(1).hover();
  await etsy.getByRole("tooltip").waitFor();
  await etsy.screenshot({ path: join(OUT, "screenshot-1-label.png") });
}

async function screenshotBlur(context: BrowserContext, etsy: Page, extensionId: string) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 352, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole("radio", { name: "Blur the photo" }).click();
  await popup.getByRole("radio", { name: "Blur the photo", checked: true }).waitFor();

  // The popup reports on the active tab: make the demo page active, then reload the popup.
  await etsy.bringToFront();
  await etsy.goto(demoUrl("Blur or hide flagged listings, your choice"));
  await waitForBadges(etsy, 3);
  await popup.reload();
  await popup.getByText(/3 disclosed AI/).waitFor();
  const popupPng = await popup.screenshot({ fullPage: true });
  await popup.close();

  // Show the popup as if opened from the toolbar, over the page's top-right corner.
  await etsy.mouse.move(0, 0);
  await etsy.evaluate(
    (src) => {
      const img = document.createElement("img");
      img.src = src;
      img.style.cssText =
        "position:fixed;top:84px;right:40px;width:352px;border-radius:10px;" +
        "box-shadow:0 12px 40px rgb(0 0 0 / 0.28);z-index:10";
      document.body.append(img);
      return img.decode();
    },
    `data:image/png;base64,${popupPng.toString("base64")}`,
  );
  await etsy.screenshot({ path: join(OUT, "screenshot-2-blur.png") });
}

/** Rendered in a plain browser: resizing a page in the extension's window garbles it. */
async function promoTile(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await page.setContent(`
    <style>
      body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center;
        gap: 22px; padding: 0 36px; box-sizing: border-box; background: #0f766e; color: #fff;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      svg { width: 112px; height: 112px; flex: none; border-radius: 26px;
        box-shadow: 0 0 0 3px rgb(255 255 255 / 0.25); }
      h1 { margin: 0 0 8px; font-size: 38px; }
      p { margin: 0; font-size: 18px; line-height: 1.35; color: #ccfbf1; }
    </style>
    ${LOGO}
    <div><h1>HandSift</h1><p>Spot AI-generated listings. Always with the reason.</p></div>`);
  await page.screenshot({ path: join(OUT, "promo-small.png") });
  await browser.close();
}

async function main(): Promise<void> {
  const worker = await startMockWorker();
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: SIZE,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  try {
    await context.route("https://www.etsy.com/**", (route) =>
      new URL(route.request().url()).pathname === "/handsift-logo.svg"
        ? route.fulfill({ contentType: "image/svg+xml", body: LOGO })
        : route.fulfill({ contentType: "text/html", body: DEMO }),
    );
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(sw.url()).host;

    const welcome = await findPage(context, "/onboarding.html");
    await screenshotWelcome(welcome);
    await welcome.getByRole("checkbox", { name: /I agree/ }).check();
    await welcome.getByRole("button", { name: "Start using HandSift" }).click();
    await welcome.getByText("You're all set").waitFor();

    const etsy = await context.newPage();
    await screenshotLabel(etsy);
    await screenshotBlur(context, etsy, extensionId);
    await promoTile();
    console.log(`Wrote store images to ${OUT}`);
  } finally {
    await context.close();
    await worker.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
