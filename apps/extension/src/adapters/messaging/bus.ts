import {
  CheckListingsReplySchema,
  ClearCacheReplySchema,
  ExtensionMessageSchema,
  PageStatsSchema,
  type CheckListingsReply,
  type ClearCacheReply,
  type ExtensionMessage,
  type PageStats,
} from "@handsift/shared";
import { browser } from "wxt/browser";
import type { z } from "zod";

// Typed wrapper over chrome.runtime / chrome.tabs messaging. Every message and reply is
// validated on receipt; senders get null (and a log line) on any failure, never a throw.

export type Runtime = Pick<typeof browser.runtime, "id" | "sendMessage" | "onMessage">;
export type Tabs = Pick<typeof browser.tabs, "sendMessage">;

/** Returns true to keep the channel open for an async sendResponse (Chrome's contract). */
export type MessageListener = (
  message: unknown,
  sender: { id?: string },
  sendResponse: (response: unknown) => void,
) => boolean;

type MessageOf<T extends ExtensionMessage["type"]> = Extract<ExtensionMessage, { type: T }>;

/**
 * Chrome's error when a tab has no HandSift content script: it isn't an Etsy page, or it
 * was opened before the extension was (re)loaded. Expected, so not worth a warning.
 */
function isNoReceiver(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Receiving end does not exist");
}

async function send<R>(
  label: string,
  schema: z.ZodType<R>,
  deliver: () => Promise<unknown>,
  isExpected: (error: unknown) => boolean = () => false,
): Promise<R | null> {
  try {
    const parsed = schema.safeParse(await deliver());
    if (parsed.success) return parsed.data;
    console.warn(`[HandSift] Invalid ${label} reply`, parsed.error.issues);
  } catch (error) {
    if (!isExpected(error)) console.warn(`[HandSift] ${label} failed`, error);
  }
  return null;
}

/**
 * Answers one message type from this extension only. If the handler fails, replies with
 * `fallback`. Returns an unsubscribe function.
 */
function handle<T extends ExtensionMessage["type"]>(
  type: T,
  handler: (message: MessageOf<T>) => Promise<unknown>,
  fallback: (message: MessageOf<T>) => unknown,
  runtime: Runtime,
): () => void {
  const listener: MessageListener = (message, sender, sendResponse) => {
    if (sender.id !== runtime.id) return false;
    const parsed = ExtensionMessageSchema.safeParse(message);
    if (!parsed.success || parsed.data.type !== type) return false;

    const typed = parsed.data as MessageOf<T>;
    handler(typed).then(sendResponse, (error: unknown) => {
      console.warn(`[HandSift] ${type} handler failed`, error);
      sendResponse(fallback(typed));
    });
    // Keep the channel open for the async sendResponse.
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => {
    runtime.onMessage.removeListener(listener);
  };
}

// checkListings: content script -> service worker

export function requestCheckListings(
  ids: string[],
  runtime: Runtime = browser.runtime,
): Promise<CheckListingsReply | null> {
  return send("checkListings", CheckListingsReplySchema, () =>
    runtime.sendMessage({ type: "checkListings", ids } satisfies MessageOf<"checkListings">),
  );
}

export function onCheckListings(
  handler: (ids: string[]) => Promise<CheckListingsReply>,
  runtime: Runtime = browser.runtime,
): () => void {
  return handle(
    "checkListings",
    ({ ids }) => handler(ids),
    ({ ids }): CheckListingsReply => ({ verdicts: [], unavailable: ids }),
    runtime,
  );
}

// clearCache: popup -> service worker

export function requestClearCache(
  runtime: Runtime = browser.runtime,
): Promise<ClearCacheReply | null> {
  return send("clearCache", ClearCacheReplySchema, () =>
    runtime.sendMessage({ type: "clearCache" } satisfies MessageOf<"clearCache">),
  );
}

export function onClearCache(
  handler: () => Promise<void>,
  runtime: Runtime = browser.runtime,
): () => void {
  return handle(
    "clearCache",
    async (): Promise<ClearCacheReply> => {
      await handler();
      return { cleared: true };
    },
    (): ClearCacheReply => ({ cleared: false }),
    runtime,
  );
}

// getPageStats: popup -> content script in a tab

/** Null if the tab has no HandSift content script (not Etsy, or opened before HandSift loaded). */
export function requestPageStats(
  tabId: number,
  tabs: Tabs = browser.tabs,
): Promise<PageStats | null> {
  return send(
    "getPageStats",
    PageStatsSchema,
    () => tabs.sendMessage(tabId, { type: "getPageStats" } satisfies MessageOf<"getPageStats">),
    isNoReceiver,
  );
}

export function onGetPageStats(
  handler: () => PageStats,
  runtime: Runtime = browser.runtime,
): () => void {
  return handle(
    "getPageStats",
    () => Promise.resolve(handler()),
    (): PageStats => ({ checked: 0, disclosed: 0, likely: 0 }),
    runtime,
  );
}
