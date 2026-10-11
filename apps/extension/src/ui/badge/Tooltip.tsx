export interface TooltipProps {
  id: string;
  summary: string;
  reasons: string[];
  onReveal?: (() => void) | undefined;
}

/** Explains why a listing was flagged. */
export function Tooltip({ id, summary, reasons, onReveal }: TooltipProps) {
  return (
    <div id={id} role="tooltip" className="tooltip">
      <p className="tooltip__summary">{summary}</p>
      {reasons.length > 0 && (
        <ul className="tooltip__reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {onReveal && (
        <button
          type="button"
          className="tooltip__reveal"
          // mousedown so it fires before the badge button loses focus and closes the tooltip.
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReveal();
          }}
        >
          Show photo
        </button>
      )}
      <p className="tooltip__brand">HandSift</p>
    </div>
  );
}
