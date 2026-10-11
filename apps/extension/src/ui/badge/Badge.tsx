import { useEffect, useId, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

export type FlaggedLevel = "disclosed_ai" | "likely_ai";

/** Grace period before closing on mouse leave, so the pointer can travel to the tooltip. */
const CLOSE_DELAY_MS = 150;

export interface BadgeProps {
  level: FlaggedLevel;
  reasons: string[];
  /** Present in blur mode while the photo is blurred: un-blurs this card. */
  onReveal?: () => void;
}

const COPY: Record<FlaggedLevel, { label: string; summary: string }> = {
  disclosed_ai: { label: "AI · disclosed", summary: "The seller disclosed that AI was used." },
  likely_ai: {
    label: "Likely AI",
    summary: "HandSift's estimate, not the seller's statement. It may be wrong.",
  },
};

/** The pill shown on a flagged listing. Hover, focus, or click to see why; Escape closes. */
export function Badge({ level, reasons, onReveal }: BadgeProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();
  const copy = COPY[level];

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <div
      className="handsift-badge"
      onMouseEnter={() => {
        clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => {
          setOpen(false);
        }, CLOSE_DELAY_MS);
      }}
    >
      <button
        type="button"
        className={`pill pill--${level}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          // Don't let the click open the Etsy listing underneath.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
      >
        {copy.label}
      </button>
      {open && (
        <Tooltip id={tooltipId} summary={copy.summary} reasons={reasons} onReveal={onReveal} />
      )}
    </div>
  );
}
