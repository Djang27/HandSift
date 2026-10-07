import { z } from "zod";

// "disclosed_ai" is a fact (the seller said so); "likely_ai" is an inference.
export const VerdictLevelSchema = z.enum(["disclosed_ai", "likely_ai", "unclear", "clean"]);

export type VerdictLevel = z.infer<typeof VerdictLevelSchema>;

export const VerdictSchema = z.object({
  listingId: z.string(),
  level: VerdictLevelSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  checkedAt: z.number().int().nonnegative(),
});

export type Verdict = z.infer<typeof VerdictSchema>;
