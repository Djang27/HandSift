import { z } from "zod";

// Normalized shop used across HandSift. Built from EtsyShop by the Worker.
export const ShopDataSchema = z.object({
  shopId: z.string(),
  /** Unix milliseconds. */
  createdAt: z.number().int().nonnegative(),
  activeListingCount: z.number().int().nonnegative(),
  digitalListingCount: z.number().int().nonnegative(),
  salesCount: z.number().int().nonnegative(),
});

export type ShopData = z.infer<typeof ShopDataSchema>;
