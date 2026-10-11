import { z } from "zod";
import { MAX_IDS_PER_REQUEST } from "./config";
import { ListingIdSchema } from "./schemas/listing";
import { VerdictSchema } from "./schemas/verdict";

// Messages between the extension's parts. Validated on receipt.

/** Content script -> service worker: verdicts for these listings on the page, please. */
export const CheckListingsMessageSchema = z.object({
  type: z.literal("checkListings"),
  ids: z.array(ListingIdSchema).min(1).max(MAX_IDS_PER_REQUEST),
});

export type CheckListingsMessage = z.infer<typeof CheckListingsMessageSchema>;

export const CheckListingsReplySchema = z.object({
  verdicts: z.array(VerdictSchema),
  /** Couldn't be checked right now; show nothing for these. */
  unavailable: z.array(z.string()),
});

export type CheckListingsReply = z.infer<typeof CheckListingsReplySchema>;

/** Popup -> service worker: delete every stored verdict. */
export const ClearCacheMessageSchema = z.object({ type: z.literal("clearCache") });

export const ClearCacheReplySchema = z.object({ cleared: z.boolean() });

export type ClearCacheReply = z.infer<typeof ClearCacheReplySchema>;

/** Popup -> content script (active tab): what's flagged on this page? */
export const GetPageStatsMessageSchema = z.object({ type: z.literal("getPageStats") });

export const PageStatsSchema = z.object({
  /** Unique listings on the page with a verdict. */
  checked: z.number().int().nonnegative(),
  disclosed: z.number().int().nonnegative(),
  likely: z.number().int().nonnegative(),
});

export type PageStats = z.infer<typeof PageStatsSchema>;

export const ExtensionMessageSchema = z.discriminatedUnion("type", [
  CheckListingsMessageSchema,
  ClearCacheMessageSchema,
  GetPageStatsMessageSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
