import { z } from "zod";

// Normalized listing shape used inside the extension. The raw Etsy response
// schema (and the mapping into this shape) is built from fixtures in Phase 1.
export const ListingDataSchema = z.object({
  listingId: z.string(),
  shopId: z.string(),
  title: z.string(),
  description: z.string(),
  whoMade: z.string(),
  tags: z.array(z.string()),
  materials: z.array(z.string()),
  aiDisclosedFlag: z.boolean().optional(),
});

export type ListingData = z.infer<typeof ListingDataSchema>;
