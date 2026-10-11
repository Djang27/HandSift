import { describe, expect, it } from "vitest";
import labelsCsv from "../../../../../data/labels.csv?raw";
import { parseLabels } from "./labels";

describe("parseLabels", () => {
  it("parses rows, keeping commas in the note", () => {
    const { rows, errors } = parseLabels(
      "listing_id,label,source_of_label\n123,ai,says Midjourney, in tags\n\n456,human,hand-thrown\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { id: "123", label: "ai", note: "says Midjourney, in tags" },
      { id: "456", label: "human", note: "hand-thrown" },
    ]);
  });

  it("reports bad lines with their line numbers instead of skipping them silently", () => {
    const { rows, errors } = parseLabels(
      "listing_id,label,source_of_label\nabc,ai,x\n123,maybe,x\n123,ai,x\n123,human,dup\n",
    );
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      'line 2: bad listing ID "abc"',
      'line 3: label must be ai or human, got "maybe"',
      "line 5: duplicate listing 123",
    ]);
  });

  it("the committed data/labels.csv is valid", () => {
    const { rows, errors } = parseLabels(labelsCsv);
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });
});
