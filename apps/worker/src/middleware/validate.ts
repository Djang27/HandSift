import { MAX_IDS_PER_REQUEST } from "@handsift/shared";
import { z } from "zod";

// Etsy listing IDs are positive int64s: 1 to 19 digits, no leading zero.
const ListingIdSchema = z.string().regex(/^[1-9]\d{0,18}$/);

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Validates `?ids=1,2,3`: the only allowed param, numeric IDs, 1 to MAX_IDS_PER_REQUEST unique. */
export function parseListingsQuery(url: URL): ParseResult<string[]> {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== "ids") || keys.length !== 1) {
    return { ok: false, message: "Expected exactly one query parameter: ids" };
  }
  const raw = url.searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(","))];
  if (ids.length > MAX_IDS_PER_REQUEST) {
    return { ok: false, message: `At most ${String(MAX_IDS_PER_REQUEST)} ids per request` };
  }
  if (!ids.every((id) => ListingIdSchema.safeParse(id).success)) {
    return { ok: false, message: "ids must be comma-separated numeric listing IDs" };
  }
  return { ok: true, value: ids };
}
