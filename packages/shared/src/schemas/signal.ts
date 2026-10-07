import { z } from "zod";

export const SignalSchema = z.object({
  id: z.string(),
  weight: z.number(),
  hit: z.boolean(),
  reason: z.string(),
});

export type Signal = z.infer<typeof SignalSchema>;
