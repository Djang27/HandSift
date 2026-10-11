import { PAGE_SCAN_DEBOUNCE_MS, VISIBILITY_MARGIN_PX } from "@handsift/shared";
import type { SiteAdapter } from "@handsift/shared/interfaces";

/**
 * Calls `onVisible` with each item's ID when its element scrolls into (or near) view.
 * Picks up items added later (infinite scroll, filters) by rescanning after DOM changes.
 * Returns a function that stops observing.
 */
export function observeVisibleItems(
  doc: Document,
  adapter: SiteAdapter,
  onVisible: (id: string, el: Element) => void,
): () => void {
  const observed = new WeakSet<Element>();
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = adapter.extractItemId(entry.target);
        if (id !== null) onVisible(id, entry.target);
      }
    },
    { rootMargin: `${String(VISIBILITY_MARGIN_PX)}px` },
  );

  function scan(): void {
    for (const el of adapter.findItemElements(doc)) {
      if (observed.has(el)) continue;
      observed.add(el);
      visibility.observe(el);
    }
  }

  let rescan: ReturnType<typeof setTimeout> | null = null;
  const changes = new MutationObserver(() => {
    rescan ??= setTimeout(() => {
      rescan = null;
      scan();
    }, PAGE_SCAN_DEBOUNCE_MS);
  });

  scan();
  changes.observe(doc.body, { childList: true, subtree: true });

  return () => {
    if (rescan !== null) clearTimeout(rescan);
    changes.disconnect();
    visibility.disconnect();
  };
}
