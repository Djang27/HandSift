import { z } from "zod";
import { MAX_IDS_PER_REQUEST } from "./config";
import { ListingIdSchema } from "./schemas/listing";
import { VerdictSchema } from "./schemas/verdict";

// Messages between the content script and the service worker. Validated on receipt.

/** Content script -> service worker: verdicts for these visible listings, please. */
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

export const ExtensionMessageSchema = z.discriminatedUnion("type", [CheckListingsMessageSchema]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
