import { z } from "zod";

// Envelopes returned by Etsy. Listings are validated one by one (EtsyListingSchema)
// so a single malformed listing doesn't sink the whole batch.

/** GET /v3/application/listings/batch */
export const EtsyBatchResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(z.unknown()),
});

export type EtsyBatchResponse = z.infer<typeof EtsyBatchResponseSchema>;

/** Error body, e.g. 404 "Not all requested listings exist. Missing listing_ids: 1." */
export const EtsyErrorSchema = z.object({
  error: z.string(),
});

export type EtsyError = z.infer<typeof EtsyErrorSchema>;
