// Exports HandSift's logo (branding/logo.svg, the source of truth) everywhere it's used:
// the extension's PNG icons, the copy the popup and welcome page import, and the website's.
//
//   pnpm --filter @handsift/extension icons
//
// Rendered with Playwright's Chromium (already used for e2e), so no image library is needed.

import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = join(import.meta.dirname, "../../..");
const SOURCE = join(ROOT, "branding/logo.svg");
const ICON_SIZES = [16, 32, 48, 128];
const COPIES = [join(ROOT, "apps/extension/src/assets/logo.svg"), join(ROOT, "site/logo.svg")];

async function main(): Promise<void> {
  const svg = await readFile(SOURCE, "utf8");
  const browser = await chromium.launch();
  try {
    for (const size of ICON_SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${svg}`,
      );
      const out = join(ROOT, `apps/extension/public/icon/${String(size)}.png`);
      await page.screenshot({ path: out, omitBackground: true });
      await page.close();
      console.log(`wrote ${out}`);
    }
  } finally {
    await browser.close();
  }
  for (const copy of COPIES) {
    await copyFile(SOURCE, copy);
    console.log(`wrote ${copy}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
