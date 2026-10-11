import { z } from "zod";

/**
 * "disclosure": the seller said so (a fact, e.g. their text says AI-generated).
 * "inference": a clue HandSift weighs (a guess, e.g. outside production partner).
 */
export const SignalKindSchema = z.enum(["disclosure", "inference"]);

export type SignalKind = z.infer<typeof SignalKindSchema>;

export const SignalSchema = z.object({
  id: z.string(),
  kind: SignalKindSchema,
  weight: z.number(),
  hit: z.boolean(),
  reason: z.string(),
});

export type Signal = z.infer<typeof SignalSchema>;
