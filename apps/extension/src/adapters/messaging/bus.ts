import {
  CheckListingsReplySchema,
  ExtensionMessageSchema,
  type CheckListingsMessage,
  type CheckListingsReply,
} from "@handsift/shared";
import { browser } from "wxt/browser";

// Typed wrapper over chrome.runtime messaging. Every message is validated on receipt.

export type Runtime = Pick<typeof browser.runtime, "id" | "sendMessage" | "onMessage">;

/** Returns true to keep the channel open for an async sendResponse (Chrome's contract). */
export type MessageListener = (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => boolean;

/** Content script side. Returns null (and logs) on any failure; never throws. */
export async function requestCheckListings(
  ids: string[],
  runtime: Runtime = browser.runtime,
): Promise<CheckListingsReply | null> {
  const message: CheckListingsMessage = { type: "checkListings", ids };
  try {
    const reply: unknown = await runtime.sendMessage(message);
    const parsed = CheckListingsReplySchema.safeParse(reply);
    if (parsed.success) return parsed.data;
    console.warn("[HandSift] Invalid reply from service worker", parsed.error.issues);
  } catch (error) {
    console.warn("[HandSift] Service worker unreachable", error);
  }
  return null;
}

/**
 * Service worker side. Answers checkListings messages from this extension only. If the
 * handler fails, replies that every ID is unavailable. Returns an unsubscribe function.
 */
export function onCheckListings(
  handler: (ids: string[]) => Promise<CheckListingsReply>,
  runtime: Runtime = browser.runtime,
): () => void {
  const listener: MessageListener = (message, sender, sendResponse) => {
    if (sender.id !== runtime.id) return false;
    const parsed = ExtensionMessageSchema.safeParse(message);
    if (!parsed.success) return false;

    const { ids } = parsed.data;
    handler(ids).then(sendResponse, (error: unknown) => {
      console.warn("[HandSift] checkListings failed", error);
      const reply: CheckListingsReply = { verdicts: [], unavailable: ids };
      sendResponse(reply);
    });
    // Keep the channel open for the async sendResponse.
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => {
    runtime.onMessage.removeListener(listener);
  };
}
