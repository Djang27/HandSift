// Saves raw Etsy API responses for the given listings (and their shops) into
// fixtures/real/, which is gitignored. Used for API recon and schema design.
//
//   pnpm fixtures:fetch <listingId> [<listingId> ...]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const API_BASE = "https://openapi.etsy.com/v3/application";
const REPO_ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(REPO_ROOT, "fixtures/real");
// Stay well under Etsy's 5 requests/second limit.
const DELAY_MS = 300;

// Only the fields this script needs. Everything else is saved untouched.
const BatchResponseSchema = z.object({
  results: z.array(z.looseObject({ listing_id: z.number(), shop_id: z.number() })),
});

async function readApiKey(): Promise<string> {
  const fromEnv = process.env.ETSY_API_KEY;
  if (fromEnv) return fromEnv;
  const devVars = await readFile(join(REPO_ROOT, "apps/worker/.dev.vars"), "utf8");
  const match = /^ETSY_API_KEY=["']?([^"'\n]+)["']?$/m.exec(devVars);
  if (!match?.[1]) throw new Error("ETSY_API_KEY not found in env or apps/worker/.dev.vars");
  return match[1];
}

async function getJson(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "x-api-key": apiKey } });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${String(res.status)}: ${await res.text()}`);
  return res.json();
}

async function saveJson(subdir: string, id: number, data: unknown): Promise<void> {
  const dir = join(OUT_DIR, subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(id)}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0 || !ids.every((id) => /^\d+$/.test(id))) {
    console.error("Usage: pnpm fixtures:fetch <listingId> [<listingId> ...]");
    process.exit(1);
  }
  const apiKey = await readApiKey();

  const batch = BatchResponseSchema.parse(
    await getJson(`/listings/batch?listing_ids=${ids.join(",")}&includes=Shop`, apiKey),
  );
  for (const listing of batch.results) {
    await saveJson("listings", listing.listing_id, listing);
  }
  const found = new Set(batch.results.map((l) => String(l.listing_id)));
  const missing = ids.filter((id) => !found.has(id));
  console.info(`Saved ${String(found.size)} listings.`);
  if (missing.length > 0) console.warn(`Not returned by Etsy: ${missing.join(", ")}`);

  const shopIds = [...new Set(batch.results.map((l) => l.shop_id))];
  for (const shopId of shopIds) {
    await sleep(DELAY_MS);
    await saveJson("shops", shopId, await getJson(`/shops/${String(shopId)}`, apiKey));
  }
  console.info(`Saved ${String(shopIds.length)} shops to ${OUT_DIR}`);
}

await main();
