// @vitest-environment jsdom
import { PAGE_SCAN_DEBOUNCE_MS } from "@handsift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { etsyAdapter } from "../sites/etsy/etsyAdapter";
import { observeVisibleItems } from "./observeVisibleItems";

// jsdom has no IntersectionObserver; this fake lets tests decide what's visible.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.targets.add(el);
  }
  disconnect(): void {
    this.disconnected = true;
    this.targets.clear();
  }
  show(...els: Element[]): void {
    const entries = els.map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

function card(id: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-listing-card-v2", "");
  el.setAttribute("data-listing-id", id);
  return el;
}

describe("observeVisibleItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports an item's ID when it becomes visible", () => {
    const a = card("1");
    document.body.append(a, card("2"));
    const onVisible = vi.fn();
    observeVisibleItems(document, etsyAdapter, onVisible);

    const io = FakeIntersectionObserver.instances[0];
    expect(io?.targets.size).toBe(2);
    io?.show(a);
    expect(onVisible).toHaveBeenCalledExactlyOnceWith("1", a);
  });

  it("observes cards added later, after the debounce", async () => {
    observeVisibleItems(document, etsyAdapter, vi.fn());
    const io = FakeIntersectionObserver.instances[0];
    document.body.append(card("3"));
    await Promise.resolve(); // let MutationObserver deliver
    expect(io?.targets.size).toBe(0);
    vi.advanceTimersByTime(PAGE_SCAN_DEBOUNCE_MS);
    expect(io?.targets.size).toBe(1);
  });

  it("stops observing when stopped", () => {
    document.body.append(card("1"));
    const stop = observeVisibleItems(document, etsyAdapter, vi.fn());
    stop();
    expect(FakeIntersectionObserver.instances[0]?.disconnected).toBe(true);
  });
});
