import type { PageStats, Settings, Verdict } from "@handsift/shared";
import type { ItemDisplay, SiteAdapter } from "@handsift/shared/interfaces";
import { displayLevel } from "../core/scoring/levels";
import { renderBadge, unrenderBadge } from "./badge/renderBadge";

export interface PageController {
  /** An item element seen on the page (a listing can appear more than once). */
  addItem(id: string, el: Element): void;
  applyVerdicts(verdicts: readonly Verdict[]): void;
  setSettings(settings: Settings): void;
  stats(): PageStats;
}

/** Applies verdicts and settings to the page through a SiteAdapter: badges, blur, hide. */
export function createPageController(adapter: SiteAdapter, initial: Settings): PageController {
  let settings = initial;
  const elements = new Map<string, Set<Element>>();
  const verdicts = new Map<string, Verdict>();
  const hosts = new WeakMap<Element, HTMLElement>();
  const revealed = new WeakSet<Element>();

  function levelOf(id: string) {
    const verdict = verdicts.get(id);
    return verdict ? displayLevel(verdict, settings.sensitivity) : null;
  }

  function clear(el: Element): void {
    const host = hosts.get(el);
    if (host) {
      unrenderBadge(host);
      hosts.delete(el);
    }
    adapter.unmountBadge(el);
    adapter.setItemDisplay(el, "visible");
  }

  function renderElement(id: string, el: Element): void {
    const verdict = verdicts.get(id);
    const level = levelOf(id);
    const flagged = level === "disclosed_ai" || level === "likely_ai";
    if (!settings.enabled || !verdict || !flagged) {
      clear(el);
      return;
    }
    const blurred = settings.mode === "blur" && !revealed.has(el);
    const host = adapter.mountBadge(el);
    hosts.set(el, host);
    renderBadge(host, {
      level,
      reasons: verdict.reasons,
      onReveal: blurred
        ? () => {
            revealed.add(el);
            renderElement(id, el);
          }
        : undefined,
    });
    const display: ItemDisplay =
      settings.mode === "hide" ? "hidden" : blurred ? "blurred" : "visible";
    adapter.setItemDisplay(el, display);
  }

  function render(id: string): void {
    const els = elements.get(id);
    if (!els) return;
    for (const el of els) {
      if (el.isConnected) renderElement(id, el);
      else els.delete(el);
    }
  }

  return {
    addItem(id, el) {
      const els = elements.get(id) ?? new Set<Element>();
      els.add(el);
      elements.set(id, els);
      if (verdicts.has(id)) renderElement(id, el);
    },

    applyVerdicts(items) {
      for (const verdict of items) {
        verdicts.set(verdict.listingId, verdict);
        render(verdict.listingId);
      }
    },

    setSettings(next) {
      settings = next;
      for (const id of elements.keys()) render(id);
    },

    stats() {
      const onPage = [...verdicts.keys()].filter((id) =>
        [...(elements.get(id) ?? [])].some((el) => el.isConnected),
      );
      const levels = onPage.map(levelOf);
      return {
        checked: onPage.length,
        disclosed: levels.filter((l) => l === "disclosed_ai").length,
        likely: levels.filter((l) => l === "likely_ai").length,
      };
    },
  };
}
