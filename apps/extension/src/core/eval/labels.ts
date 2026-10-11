import { ListingIdSchema } from "@handsift/shared";
import type { Label } from "./metrics";

export interface LabelRow {
  id: string;
  label: Label;
  /** Why it got this label (free text; may contain commas). */
  note: string;
}

export interface ParsedLabels {
  rows: LabelRow[];
  /** One message per bad line, with its line number. */
  errors: string[];
}

/** Parses data/labels.csv (`listing_id,label,source_of_label`). Pure. */
export function parseLabels(csv: string): ParsedLabels {
  const rows: LabelRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  csv.split(/\r?\n/).forEach((line, index) => {
    if (index === 0 || line.trim() === "") return;
    const [rawId = "", rawLabel = "", ...rest] = line.split(",");
    const id = rawId.trim();
    const label = rawLabel.trim();
    const where = `line ${String(index + 1)}`;
    if (!ListingIdSchema.safeParse(id).success) {
      errors.push(`${where}: bad listing ID "${id}"`);
    } else if (label !== "ai" && label !== "human") {
      errors.push(`${where}: label must be ai or human, got "${label}"`);
    } else if (seen.has(id)) {
      errors.push(`${where}: duplicate listing ${id}`);
    } else {
      seen.add(id);
      rows.push({ id, label, note: rest.join(",").trim() });
    }
  });
  return { rows, errors };
}
