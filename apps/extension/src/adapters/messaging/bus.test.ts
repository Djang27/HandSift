import type { CheckListingsReply } from "@handsift/shared";
import { describe, expect, it, vi } from "vitest";
import {
  onCheckListings,
  onClearCache,
  onGetPageStats,
  requestCheckListings,
  requestClearCache,
  requestPageStats,
  type MessageListener,
  type Runtime,
  type Tabs,
} from "./bus";

type Listener = MessageListener;

const EXT_ID = "handsift-test-id";
const REPLY: CheckListingsReply = { verdicts: [], unavailable: [] };

function fakeRuntime(sendMessage: Runtime["sendMessage"] = vi.fn()) {
  const listeners = new Set<Listener>();
  const runtime = {
    id: EXT_ID,
    sendMessage,
    onMessage: {
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    },
  } as unknown as Runtime;

  /** Delivers a message like Chrome would; resolves with the reply (undefined if none). */
  function dispatch(message: unknown, senderId = EXT_ID): Promise<unknown> {
    return new Promise((resolve) => {
      const [listener] = listeners;
      if (!listener) {
        resolve(undefined);
        return;
      }
      const keepOpen = listener(message, { id: senderId }, resolve);
      if (!keepOpen) resolve(undefined);
    });
  }
  return { runtime, dispatch, listeners };
}

describe("requestCheckListings", () => {
  it("sends a checkListings message and returns the validated reply", async () => {
    const sendMessage = vi.fn().mockResolvedValue(REPLY);
    const { runtime } = fakeRuntime(sendMessage);
    expect(await requestCheckListings(["1"], runtime)).toEqual(REPLY);
    expect(sendMessage).toHaveBeenCalledWith({ type: "checkListings", ids: ["1"] });
  });

  it("returns null for an invalid reply or an unreachable service worker", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await requestCheckListings(
        ["1"],
        fakeRuntime(vi.fn().mockResolvedValue({ nope: 1 })).runtime,
      ),
    ).toBeNull();
    expect(
      await requestCheckListings(
        ["1"],
        fakeRuntime(vi.fn().mockRejectedValue(new Error("gone"))).runtime,
      ),
    ).toBeNull();
  });
});

describe("onCheckListings", () => {
  it("answers valid messages from this extension", async () => {
    const { runtime, dispatch } = fakeRuntime();
    const handler = vi.fn().mockResolvedValue(REPLY);
    onCheckListings(handler, runtime);

    expect(await dispatch({ type: "checkListings", ids: ["1", "2"] })).toEqual(REPLY);
    expect(handler).toHaveBeenCalledWith(["1", "2"]);
  });

  it("ignores messages from other senders and invalid messages", async () => {
    const { runtime, dispatch } = fakeRuntime();
    const handler = vi.fn().mockResolvedValue(REPLY);
    onCheckListings(handler, runtime);

    expect(await dispatch({ type: "checkListings", ids: ["1"] }, "someone-else")).toBeUndefined();
    expect(await dispatch({ type: "checkListings", ids: ["not-an-id"] })).toBeUndefined();
    expect(await dispatch("hello")).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("replies all-unavailable if the handler fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runtime, dispatch } = fakeRuntime();
    onCheckListings(vi.fn().mockRejectedValue(new Error("boom")), runtime);
    expect(await dispatch({ type: "checkListings", ids: ["1"] })).toEqual({
      verdicts: [],
      unavailable: ["1"],
    });
  });

  it("can unsubscribe", () => {
    const { runtime, listeners } = fakeRuntime();
    const stop = onCheckListings(vi.fn(), runtime);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("message types don't cross", () => {
  it("each handler answers only its own type", async () => {
    const { runtime, dispatch } = fakeRuntime();
    const check = vi.fn().mockResolvedValue(REPLY);
    onCheckListings(check, runtime);
    expect(await dispatch({ type: "clearCache" })).toBeUndefined();
    expect(check).not.toHaveBeenCalled();
  });
});

describe("clearCache", () => {
  it("runs the handler and replies cleared", async () => {
    const { runtime, dispatch } = fakeRuntime();
    const clear = vi.fn().mockResolvedValue(undefined);
    onClearCache(clear, runtime);
    expect(await dispatch({ type: "clearCache" })).toEqual({ cleared: true });
    expect(clear).toHaveBeenCalledOnce();
  });

  it("replies cleared: false if the handler fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runtime, dispatch } = fakeRuntime();
    onClearCache(vi.fn().mockRejectedValue(new Error("db")), runtime);
    expect(await dispatch({ type: "clearCache" })).toEqual({ cleared: false });
  });

  it("requestClearCache validates the reply", async () => {
    const { runtime } = fakeRuntime(vi.fn().mockResolvedValue({ cleared: true }));
    expect(await requestClearCache(runtime)).toEqual({ cleared: true });
  });
});

describe("getPageStats", () => {
  const STATS = { checked: 46, disclosed: 3, likely: 0 };

  it("content script answers with its page stats", async () => {
    const { runtime, dispatch } = fakeRuntime();
    onGetPageStats(() => STATS, runtime);
    expect(await dispatch({ type: "getPageStats" })).toEqual(STATS);
  });

  it("popup asks the tab for its stats", async () => {
    const tabs = { sendMessage: vi.fn().mockResolvedValue(STATS) } as unknown as Tabs;
    expect(await requestPageStats(7, tabs)).toEqual(STATS);
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, { type: "getPageStats" });
  });

  it("returns null quietly when the tab has no content script (expected)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tabs = {
      sendMessage: vi
        .fn()
        .mockRejectedValue(
          new Error("Could not establish connection. Receiving end does not exist."),
        ),
    } as unknown as Tabs;
    expect(await requestPageStats(7, tabs)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("still warns about unexpected failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tabs = { sendMessage: vi.fn().mockRejectedValue(new Error("boom")) } as unknown as Tabs;
    expect(await requestPageStats(7, tabs)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
