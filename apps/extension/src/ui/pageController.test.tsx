// @vitest-environment jsdom
import { DEFAULT_SETTINGS, type Settings, type Verdict } from "@handsift/shared";
import { act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { etsyAdapter } from "../adapters/sites/etsy/etsyAdapter";
import { createPageController } from "./pageController";

const DISCLOSED: Verdict = {
  listingId: "1",
  level: "disclosed_ai",
  score: 1,
  reasons: ['Seller disclosed AI in the tags: "ai art"'],
  checkedAt: 1,
};
const CLEAN: Verdict = { listingId: "2", level: "clean", score: 0, reasons: [], checkedAt: 1 };
const MAYBE: Verdict = {
  listingId: "3",
  level: "unclear",
  score: 0.75,
  reasons: ["two clues"],
  checkedAt: 1,
};

/** Fails the test with a clear message instead of a type cast. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

function setupPage() {
  document.body.innerHTML = ["1", "2", "3"]
    .map(
      (id) =>
        `<ul><li><div data-listing-card-v2 data-listing-id="${id}"><img src="${id}.jpg"></div></li></ul>`,
    )
    .join("");
  const cards = new Map(
    etsyAdapter.findItemElements(document).map((el) => [etsyAdapter.extractItemId(el) ?? "", el]),
  );
  return (id: string) => {
    const card = must(cards.get(id), `card ${id}`);
    return {
      card,
      li: must(card.closest("li"), "li"),
      img: must(card.querySelector("img"), "img"),
    };
  };
}

function badgeIn(card: Element) {
  const host = card.querySelector("handsift-badge");
  return host?.shadowRoot ? within(host.shadowRoot as unknown as HTMLElement) : null;
}

function controllerWith(settings: Partial<Settings> = {}) {
  const page = setupPage();
  const controller = createPageController(etsyAdapter, { ...DEFAULT_SETTINGS, ...settings });
  for (const id of ["1", "2", "3"]) controller.addItem(id, page(id).card);
  act(() => {
    controller.applyVerdicts([DISCLOSED, CLEAN, MAYBE]);
  });
  return { controller, page };
}

describe("pageController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("badges only flagged listings, in label mode leaving them visible", () => {
    const { page } = controllerWith();
    expect(badgeIn(page("1").card)?.getByRole("button", { name: "AI · disclosed" })).toBeTruthy();
    expect(badgeIn(page("2").card)).toBeNull();
    expect(badgeIn(page("3").card)).toBeNull(); // 0.75 is below the conservative threshold
    expect(page("1").li.style.display).toBe("");
  });

  it("blurs flagged photos in blur mode, and 'Show photo' reveals one", async () => {
    const { page } = controllerWith({ mode: "blur" });
    expect(page("1").img.style.filter).toMatch(/^blur/);
    expect(page("2").img.style.filter).toBe("");

    const user = userEvent.setup();
    const badge = badgeIn(page("1").card);
    const shadow = must(badge, "badge");
    await user.click(shadow.getByRole("button", { name: "AI · disclosed" }));
    await user.click(shadow.getByRole("button", { name: "Show photo" }));
    expect(page("1").img.style.filter).toBe("");
  });

  it("hides flagged listings in hide mode", () => {
    const { page } = controllerWith({ mode: "hide" });
    expect(page("1").li.style.display).toBe("none");
    expect(page("2").li.style.display).toBe("");
  });

  it("re-renders when settings change: sensitivity, mode, and turning off", () => {
    const { controller, page } = controllerWith({ mode: "hide" });

    act(() => {
      controller.setSettings({ ...DEFAULT_SETTINGS, mode: "label", sensitivity: "balanced" });
    });
    expect(page("1").li.style.display).toBe("");
    expect(badgeIn(page("3").card)?.getByRole("button", { name: "Likely AI" })).toBeTruthy();

    act(() => {
      controller.setSettings({ ...DEFAULT_SETTINGS, enabled: false });
    });
    expect(badgeIn(page("1").card)).toBeNull();
    expect(badgeIn(page("3").card)).toBeNull();
  });

  it("badges a listing that appears again later (e.g. as an ad)", () => {
    const { controller } = controllerWith();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-listing-card-v2 data-listing-id="1"></div>`,
    );
    const again = must(document.body.lastElementChild, "new card");
    act(() => {
      controller.addItem("1", again);
    });
    expect(badgeIn(again)).not.toBeNull();
  });

  it("reports page stats for the user's sensitivity, ignoring removed cards", () => {
    const { controller, page } = controllerWith();
    expect(controller.stats()).toEqual({ checked: 3, disclosed: 1, likely: 0 });
    act(() => {
      controller.setSettings({ ...DEFAULT_SETTINGS, sensitivity: "balanced" });
    });
    expect(controller.stats()).toEqual({ checked: 3, disclosed: 1, likely: 1 });
    page("2").li.remove();
    expect(controller.stats().checked).toBe(2);
  });
});
