import { describe, expect, it, vi } from "vitest";
import {
  abortChatAction,
  registerChatAction,
  resetChatActions,
  subscribeChatActionReset,
  unregisterChatAction,
} from "@/utils/chatActions";

describe("chat action registry", () => {
  it("aborts a registered action and notifies reset listeners", () => {
    const controller = new AbortController();
    const listener = vi.fn();
    const unsubscribe = subscribeChatActionReset(listener);
    registerChatAction("thread-a", controller);

    resetChatActions("thread-a");

    expect(controller.signal.aborted).toBe(true);
    expect(listener).toHaveBeenCalledWith("thread-a");
    unsubscribe();
  });

  it("does not notify listeners for another thread", () => {
    const controller = new AbortController();
    const listener = vi.fn();
    const unsubscribe = subscribeChatActionReset(listener);
    registerChatAction("thread-b", controller);

    resetChatActions("thread-a");

    expect(controller.signal.aborted).toBe(false);
    expect(listener).toHaveBeenCalledWith("thread-a");
    unsubscribe();
    resetChatActions("thread-b");
    expect(controller.signal.aborted).toBe(true);
  });

  it("aborts an action directly and ignores stale unregister calls", () => {
    const first = new AbortController();
    const second = new AbortController();
    registerChatAction("thread-c", first);
    registerChatAction("thread-c", second);
    expect(first.signal.aborted).toBe(true);

    unregisterChatAction("thread-c", first);
    abortChatAction("thread-c");
    expect(second.signal.aborted).toBe(true);
  });
});
