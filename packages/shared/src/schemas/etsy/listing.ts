import { z } from "zod";
import { EtsyShopSchema } from "./shop";

// Raw Etsy ShopListingWithAssociations, only the fields HandSift uses.
// Shape confirmed against fixtures/real/listings (see docs/etsy-api.md).
export const EtsyListingSchema = z.object({
  listing_id: z.number().int().positive(),
  shop_id: z.number().int().positive(),
  title: z.string(),
  /** HTML-entity encoded. */
  description: z.string(),
  tags: z.array(z.string()),
  materials: z.array(z.string()),
  // Strings rather than enums so a new Etsy value degrades to "unknown" instead of
  // failing the whole listing.
  who_made: z.string().nullable(),
  listing_type: z.string(),
  production_partners: z.array(z.object({ production_partner_id: z.number().int() })),
  /** Present only when requested with includes=Shop. */
  shop: EtsyShopSchema.nullable().optional(),
});

export type EtsyListing = z.infer<typeof EtsyListingSchema>;
