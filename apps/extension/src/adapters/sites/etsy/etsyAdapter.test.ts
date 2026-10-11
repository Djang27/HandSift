// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import syntheticPage from "../../../../../../fixtures/synthetic/search-pages/search-results.html?raw";
import { etsyAdapter } from "./etsyAdapter";

const realPages = import.meta.glob<string>("../../../../../../fixtures/real/search-pages/*.html", {
  eager: true,
  query: "?raw",
  import: "default",
});

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function ids(doc: Document): (string | null)[] {
  return etsyAdapter.findItemElements(doc).map((el) => etsyAdapter.extractItemId(el));
}

describe("etsyAdapter.matches", () => {
  it.each([
    ["https://www.etsy.com/search?q=ai+art", true],
    ["https://etsy.com/shop/Example", true],
    ["https://www.etsy.com/uk/listing/1/x", true],
    ["https://etsy.com.evil.example/search", false],
    ["https://notetsy.com/", false],
    ["https://example.com/?etsy.com", false],
  ])("%s -> %s", (url, expected) => {
    expect(etsyAdapter.matches(new URL(url))).toBe(expected);
  });
});

describe("etsyAdapter on the synthetic search page", () => {
  const doc = parse(syntheticPage);

  it("finds result cards only, not inner elements or other widgets", () => {
    expect(etsyAdapter.findItemElements(doc)).toHaveLength(4);
  });

  it("extracts valid IDs and returns null for malformed ones", () => {
    expect(ids(doc)).toEqual(["1000000001", "1000000004", "1000000001", null]);
  });

  it("mounts one shadow-DOM badge host per card, idempotently", () => {
    const [card] = etsyAdapter.findItemElements(doc);
    if (!card) throw new Error("no card");
    const host = etsyAdapter.mountBadge(card);
    expect(host.shadowRoot).not.toBeNull();
    expect(card.firstElementChild).toBe(host);
    expect(etsyAdapter.mountBadge(card)).toBe(host);
    expect(card.querySelectorAll("handsift-badge")).toHaveLength(1);
  });
});

describe.skipIf(Object.keys(realPages).length === 0)(
  "etsyAdapter on real saved search pages",
  () => {
    it.each(Object.entries(realPages))("finds and identifies every card in %s", (_, html) => {
      const doc = parse(html);
      const found = ids(doc);
      expect(found.length).toBeGreaterThanOrEqual(40);
      expect(found.every((id) => id !== null)).toBe(true);
      // Cards never nest, so each card is counted once.
      const cards = etsyAdapter.findItemElements(doc);
      expect(cards.every((card) => !card.parentElement?.closest("[data-listing-card-v2]"))).toBe(
        true,
      );
    });
  },
);
