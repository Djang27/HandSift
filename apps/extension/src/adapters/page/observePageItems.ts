import { PAGE_SCAN_DEBOUNCE_MS } from "@handsift/shared";
import type { SiteAdapter } from "@handsift/shared/interfaces";

/**
 * Reports every item on the page once, while the page is visible: all current items right
 * away, then items added later (infinite scroll, filters) after a debounced rescan. The
 * whole page goes in one batch because Etsy charges per call, not per listing. Hidden
 * (background) tabs report nothing until they're shown. Returns a function that stops.
 */
export function observePageItems(
  doc: Document,
  adapter: SiteAdapter,
  onItem: (id: string, el: Element) => void,
): () => void {
  const reported = new WeakSet<Element>();

  function scan(): void {
    if (doc.visibilityState !== "visible") return;
    for (const el of adapter.findItemElements(doc)) {
      if (reported.has(el)) continue;
      reported.add(el);
      const id = adapter.extractItemId(el);
      if (id !== null) onItem(id, el);
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
  doc.addEventListener("visibilitychange", scan);

  return () => {
    if (rescan !== null) clearTimeout(rescan);
    changes.disconnect();
    doc.removeEventListener("visibilitychange", scan);
  };
}
