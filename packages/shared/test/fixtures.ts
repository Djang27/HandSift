import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "../../../fixtures");

/** Reads a committed synthetic fixture, e.g. "etsy/listings-batch.json". */
export function readSynthetic(path: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, "synthetic", path), "utf8"));
}

/**
 * Reads every JSON file in fixtures/real/<subdir>. Real fixtures are gitignored, so this
 * returns [] in CI and on fresh clones.
 */
export function readRealDir(subdir: string): { name: string; data: unknown }[] {
  const dir = join(FIXTURES_DIR, "real", subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const data: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      return { name, data };
    });
}
