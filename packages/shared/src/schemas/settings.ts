import { z } from "zod";

/** How flagged listings are shown. */
export const DisplayModeSchema = z.enum(["label", "blur", "hide"]);
export type DisplayMode = z.infer<typeof DisplayModeSchema>;

/** How readily inferred ("likely AI") listings are flagged. Disclosed AI is always shown. */
export const SensitivitySchema = z.enum(["conservative", "balanced", "aggressive"]);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const SettingsSchema = z.object({
  enabled: z.boolean(),
  mode: DisplayModeSchema,
  sensitivity: SensitivitySchema,
  /** Version of the terms and privacy policy the user accepted; 0 = not yet. */
  termsAcceptedVersion: z.number().int().nonnegative(),
});

export type Settings = z.infer<typeof SettingsSchema>;
