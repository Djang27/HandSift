import { z } from "zod";

// Raw Etsy Shop, only the fields HandSift uses. z.object strips everything else, which
// keeps personal information (login_name, policies, ...) out of our system.
// Shape confirmed against fixtures/real/shops (see docs/etsy-api.md).
export const EtsyShopSchema = z.object({
  shop_id: z.number().int().positive(),
  /** Unix seconds. */
  create_date: z.number().int().nonnegative(),
  listing_active_count: z.number().int().nonnegative(),
  digital_listing_count: z.number().int().nonnegative(),
  transaction_sold_count: z.number().int().nonnegative(),
});

export type EtsyShop = z.infer<typeof EtsyShopSchema>;
