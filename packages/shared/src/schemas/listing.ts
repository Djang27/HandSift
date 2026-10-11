import { z } from "zod";

// Normalized listing used across HandSift. Built from EtsyListing by the Worker.
export const ListingDataSchema = z.object({
  listingId: z.string(),
  shopId: z.string(),
  title: z.string(),
  /** Plain text (HTML entities decoded). */
  description: z.string(),
  tags: z.array(z.string()),
  materials: z.array(z.string()),
  /** Etsy who_made: "i_did" | "someone_else" | "collective", or null if unset. */
  whoMade: z.string().nullable(),
  /** Etsy listing_type: "physical" | "download" | "both". */
  listingType: z.string(),
  /** True when Etsy lists an outside production partner (e.g. print-on-demand). */
  hasProductionPartner: z.boolean(),
});

export type ListingData = z.infer<typeof ListingDataSchema>;
