// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// branding/logo.svg is the source; `pnpm --filter @handsift/extension icons` copies it here
// and to the website.
const ROOT = join(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const SOURCE = read("branding/logo.svg");

describe("logo", () => {
  it("is valid SVG (browsers show a broken image otherwise)", () => {
    const doc = new DOMParser().parseFromString(SOURCE, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.localName).toBe("svg");
  });

  it("copies match the source (re-run the icons script after editing it)", () => {
    expect(read("apps/extension/src/assets/logo.svg")).toBe(SOURCE);
    expect(read("site/logo.svg")).toBe(SOURCE);
  });
});
