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

describe("etsyAdapter display", () => {
  function gridWithCard(): { li: HTMLLIElement; card: Element; img: HTMLImageElement } {
    const doc = parse(
      `<ul><li style="display: flex"><div data-listing-card-v2 data-listing-id="1"><img src="x.jpg" style="filter: saturate(1.1)"></div></li></ul>`,
    );
    const [card] = etsyAdapter.findItemElements(doc);
    const li = doc.querySelector("li");
    const img = doc.querySelector("img");
    if (!card || !li || !img) throw new Error("bad fixture");
    return { li, card, img };
  }

  it("hides the whole grid cell and restores Etsy's own display afterwards", () => {
    const { li, card } = gridWithCard();
    etsyAdapter.setItemDisplay(card, "hidden");
    expect(li.style.display).toBe("none");
    etsyAdapter.setItemDisplay(card, "visible");
    expect(li.style.display).toBe("flex");
  });

  it("blurs the photo and restores its original filter", () => {
    const { card, img } = gridWithCard();
    etsyAdapter.setItemDisplay(card, "blurred");
    expect(img.style.filter).toMatch(/^blur\(/);
    etsyAdapter.setItemDisplay(card, "blurred"); // idempotent
    etsyAdapter.setItemDisplay(card, "visible");
    expect(img.style.filter).toBe("saturate(1.1)");
  });

  it("switching between hidden and blurred keeps only the current effect", () => {
    const { li, card, img } = gridWithCard();
    etsyAdapter.setItemDisplay(card, "hidden");
    etsyAdapter.setItemDisplay(card, "blurred");
    expect(li.style.display).toBe("flex");
    expect(img.style.filter).toMatch(/^blur\(/);
  });

  it("unmounts the badge host", () => {
    const { card } = gridWithCard();
    etsyAdapter.mountBadge(card);
    etsyAdapter.unmountBadge(card);
    expect(card.querySelector("handsift-badge")).toBeNull();
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
