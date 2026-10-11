// The only module that talks to Etsy. See docs/etsy-api.md for the endpoint's behavior.

import {
  EtsyBatchResponseSchema,
  EtsyErrorSchema,
  EtsyListingSchema,
  MAX_IDS_PER_REQUEST,
  type EtsyListing,
} from "@handsift/shared";

const BATCH_URL = "https://openapi.etsy.com/v3/application/listings/batch";
const MISSING_IDS = /Missing listing_ids:\s*([\d,\s]+)/;

export class EtsyRateLimitedError extends Error {
  override name = "EtsyRateLimitedError";
}

export class EtsyUpstreamError extends Error {
  override name = "EtsyUpstreamError";
}

export interface EtsyBatchResult {
  listings: EtsyListing[];
  /** IDs Etsy says don't exist. */
  missing: string[];
  /** IDs Etsy returned that failed validation. Treated as "no data", never guessed at. */
  invalid: string[];
  etsyCalls: number;
  /** From Etsy's x-remaining-today header, if present. */
  remainingToday: number | null;
}

export interface EtsyClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
}

/**
 * Fetches up to MAX_IDS_PER_REQUEST listings, with their shops attached, in one call.
 * If Etsy rejects the batch because some IDs don't exist, drops those and retries once.
 * Throws EtsyRateLimitedError on 429 and EtsyUpstreamError on anything else unexpected.
 */
export async function fetchListingsBatch(
  ids: readonly string[],
  options: EtsyClientOptions,
): Promise<EtsyBatchResult> {
  if (ids.length === 0 || ids.length > MAX_IDS_PER_REQUEST) {
    throw new RangeError(`Expected 1 to ${String(MAX_IDS_PER_REQUEST)} IDs`);
  }
  const missing: string[] = [];
  let pending = [...ids];
  let etsyCalls = 0;
  let remainingToday: number | null = null;

  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    const res = await request(pending, options);
    etsyCalls++;
    remainingToday = readRemainingToday(res) ?? remainingToday;

    if (res.ok) {
      const { listings, invalid } = parseBatch(await readJson(res));
      return { listings, missing, invalid, etsyCalls, remainingToday };
    }
    if (res.status === 429) {
      throw new EtsyRateLimitedError("Etsy rate limit reached");
    }
    if (res.status === 404 && attempt === 0) {
      const notFound = parseMissingIds(await readJson(res));
      if (notFound?.every((id) => pending.includes(id))) {
        missing.push(...notFound);
        pending = pending.filter((id) => !notFound.includes(id));
        continue;
      }
    }
    throw new EtsyUpstreamError(`Etsy returned HTTP ${String(res.status)}`);
  }
  return { listings: [], missing, invalid: [], etsyCalls, remainingToday };
}

async function request(ids: readonly string[], options: EtsyClientOptions): Promise<Response> {
  const url = `${BATCH_URL}?listing_ids=${ids.join(",")}&includes=Shop`;
  const doFetch = options.fetch ?? fetch;
  try {
    return await doFetch(url, { headers: { "x-api-key": options.apiKey } });
  } catch (error) {
    throw new EtsyUpstreamError(`Etsy request failed: ${String(error)}`);
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new EtsyUpstreamError(`Etsy returned invalid JSON (HTTP ${String(res.status)})`);
  }
}

function parseBatch(body: unknown): { listings: EtsyListing[]; invalid: string[] } {
  const envelope = EtsyBatchResponseSchema.safeParse(body);
  if (!envelope.success) throw new EtsyUpstreamError("Unexpected Etsy batch response shape");

  const listings: EtsyListing[] = [];
  const invalid: string[] = [];
  for (const raw of envelope.data.results) {
    const parsed = EtsyListingSchema.safeParse(raw);
    if (parsed.success) {
      listings.push(parsed.data);
    } else {
      invalid.push(rawListingId(raw) ?? "unknown");
    }
  }
  return { listings, invalid };
}

function parseMissingIds(body: unknown): string[] | null {
  const parsed = EtsyErrorSchema.safeParse(body);
  if (!parsed.success) return null;
  const match = MISSING_IDS.exec(parsed.data.error);
  const ids = match?.[1]
    ?.split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids && ids.length > 0 ? ids : null;
}

function rawListingId(raw: unknown): string | null {
  if (typeof raw === "object" && raw !== null && "listing_id" in raw) {
    const id = raw.listing_id;
    return typeof id === "number" ? String(id) : null;
  }
  return null;
}

function readRemainingToday(res: Response): number | null {
  const value = res.headers.get("x-remaining-today");
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
