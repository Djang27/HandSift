// @vitest-environment jsdom
import { PAGE_SCAN_DEBOUNCE_MS } from "@handsift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { etsyAdapter } from "../sites/etsy/etsyAdapter";
import { observePageItems } from "./observePageItems";

function card(id: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-listing-card-v2", "");
  el.setAttribute("data-listing-id", id);
  return el;
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("observePageItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports every card on the page at once, not just visible ones", () => {
    document.body.append(card("1"), card("2"), card("3"));
    const onItem = vi.fn();
    observePageItems(document, etsyAdapter, onItem);
    expect(onItem.mock.calls.map(([id]) => id as string)).toEqual(["1", "2", "3"]);
  });

  it("reports only cards added later, after the debounce", async () => {
    document.body.append(card("1"));
    const onItem = vi.fn();
    observePageItems(document, etsyAdapter, onItem);
    onItem.mockClear();

    document.body.append(card("2"));
    await Promise.resolve(); // let MutationObserver deliver
    expect(onItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PAGE_SCAN_DEBOUNCE_MS);
    expect(onItem.mock.calls.map(([id]) => id as string)).toEqual(["2"]);
  });

  it("waits until a background tab is shown", () => {
    setVisibility("hidden");
    document.body.append(card("1"));
    const onItem = vi.fn();
    observePageItems(document, etsyAdapter, onItem);
    expect(onItem).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onItem).toHaveBeenCalledOnce();
  });

  it("skips cards with malformed IDs and stops cleanly", async () => {
    document.body.append(card("oops"));
    const onItem = vi.fn();
    const stop = observePageItems(document, etsyAdapter, onItem);
    expect(onItem).not.toHaveBeenCalled();

    stop();
    document.body.append(card("5"));
    await Promise.resolve();
    vi.advanceTimersByTime(PAGE_SCAN_DEBOUNCE_MS);
    expect(onItem).not.toHaveBeenCalled();
  });
});
