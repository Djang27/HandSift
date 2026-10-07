import { z } from "zod";

// Normalized shop shape. Remaining fields are added in Phase 1 from fixtures.
export const ShopDataSchema = z.object({
  shopId: z.string(),
});

export type ShopData = z.infer<typeof ShopDataSchema>;
