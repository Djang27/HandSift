import { z } from "zod";
import { ListingDataSchema } from "./schemas/listing";
import { ShopDataSchema } from "./schemas/shop";

// Worker request/response contracts. Versioned routes: breaking changes get a new /vN/.

/** Header the extension sends with its version so Worker logs show which versions are live. */
export const VERSION_HEADER = "X-HandSift-Version";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ErrorCodeSchema = z.enum([
  "invalid_request",
  "forbidden",
  "not_found",
  "rate_limited",
  "upstream_error",
  "internal_error",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: ErrorCodeSchema,
  message: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// GET /v1/listings?ids=<id>,<id>,...

export const V1_LISTINGS_PATH = "/v1/listings";

export const V1ListingResultSchema = z.object({
  listing: ListingDataSchema,
  /** Null if Etsy didn't attach the shop. */
  shop: ShopDataSchema.nullable(),
  /**
   * When the Worker fetched this from Etsy (Unix ms). Clients must stop showing it once
   * ETSY_LISTING_MAX_AGE_MS has passed since this time.
   */
  fetchedAt: z.number().int().nonnegative(),
});

export type V1ListingResult = z.infer<typeof V1ListingResultSchema>;

export const V1ListingsResponseSchema = z.object({
  results: z.array(V1ListingResultSchema),
  /** Requested IDs Etsy says don't exist (deleted, private, ...). Show nothing for these. */
  missing: z.array(z.string()),
  /**
   * Requested IDs that couldn't be checked right now (Etsy rate limit or error, or invalid
   * Etsy data). Show nothing for these; a non-empty list means "back off for a bit".
   */
  unavailable: z.array(z.string()),
});

export type V1ListingsResponse = z.infer<typeof V1ListingsResponseSchema>;
