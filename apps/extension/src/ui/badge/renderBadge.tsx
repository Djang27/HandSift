import { createRoot, type Root } from "react-dom/client";
import { Badge, type BadgeProps } from "./Badge";
import badgeCss from "./badge.css?inline";

const roots = new WeakMap<HTMLElement, Root>();

/** Renders (or re-renders) a badge into a Shadow DOM host from SiteAdapter.mountBadge. */
export function renderBadge(host: HTMLElement, props: BadgeProps): void {
  let root = roots.get(host);
  if (!root) {
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = host.ownerDocument.createElement("style");
    style.textContent = badgeCss;
    const container = host.ownerDocument.createElement("div");
    shadow.append(style, container);
    root = createRoot(container);
    roots.set(host, root);
  }
  root.render(<Badge {...props} />);
}

/** Unmounts the React tree before the host is removed. */
export function unrenderBadge(host: HTMLElement): void {
  roots.get(host)?.unmount();
  roots.delete(host);
}
