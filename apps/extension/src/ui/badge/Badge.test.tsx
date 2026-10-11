// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("shows a disclosure and a guess differently", () => {
    const { rerender } = render(<Badge level="disclosed_ai" reasons={[]} />);
    expect(screen.getByRole("button", { name: "AI · disclosed" })).toBeTruthy();
    rerender(<Badge level="likely_ai" reasons={[]} />);
    expect(screen.getByRole("button", { name: "Likely AI" })).toBeTruthy();
  });

  it("explains why when clicked, and says a guess may be wrong", async () => {
    const user = userEvent.setup();
    render(<Badge level="likely_ai" reasons={["Made by an outside production partner"]} />);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Likely AI" }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("may be wrong");
    expect(tooltip.textContent).toContain("Made by an outside production partner");
    expect(screen.getByRole("button", { name: "Likely AI" }).getAttribute("aria-describedby")).toBe(
      tooltip.id,
    );
  });

  it("stays open while the pointer moves from the pill to the tooltip", async () => {
    const user = userEvent.setup();
    render(<Badge level="likely_ai" reasons={["a reason"]} />);
    await user.hover(screen.getByRole("button", { name: "Likely AI" }));
    await user.hover(screen.getByRole("tooltip"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Badge level="likely_ai" reasons={[]} />);
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus", async () => {
    const user = userEvent.setup();
    render(<Badge level="disclosed_ai" reasons={['Seller disclosed AI in the tags: "ai art"']} />);
    await user.tab();
    expect(screen.getByRole("tooltip").textContent).toContain("seller disclosed");
  });

  it("offers 'Show photo' only when it can reveal a blurred photo", async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const { rerender } = render(<Badge level="disclosed_ai" reasons={[]} />);
    await user.click(screen.getByRole("button", { name: "AI · disclosed" }));
    expect(screen.queryByRole("button", { name: "Show photo" })).toBeNull();

    rerender(<Badge level="disclosed_ai" reasons={[]} onReveal={onReveal} />);
    await user.click(screen.getByRole("button", { name: "Show photo" }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("doesn't let a click through to the listing link underneath", async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn((e: { defaultPrevented: boolean }) => e.defaultPrevented);
    render(
      <a href="#listing" onClick={(e) => onLinkClick(e)}>
        <Badge level="likely_ai" reasons={[]} />
      </a>,
    );
    await user.click(screen.getByRole("button", { name: "Likely AI" }));
    expect(onLinkClick).not.toHaveBeenCalled();
  });
});
