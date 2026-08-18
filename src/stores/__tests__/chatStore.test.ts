import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const storage: Record<string, string> = {};

vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    for (const key of Object.keys(storage)) delete storage[key];
  },
  key: (index: number) => Object.keys(storage)[index] ?? null,
  get length() {
    return Object.keys(storage).length;
  },
});

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  BaseDirectory: { AppData: 22 },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
  },
}));

import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useChatStore, messageKey, flushChatSave } from "@/stores/chatStore";

const writeTextFileMock = writeTextFile as Mock;

beforeEach(async () => {
  // Drain any debounced thread save left over from the previous test so a
  // stale timer cannot fire into the next test's assertions.
  await flushChatSave();
  vi.clearAllMocks();
  for (const key of Object.keys(storage)) delete storage[key];
  useChatStore.setState({
    messages: [],
    activeThreadId: null,
    threadLoaded: true,
    streamingText: "",
    error: null,
    isSending: false,
    drafts: {},
  });
});

describe("messageKey", () => {
  it("distinguishes messages with the same content by timestamp", () => {
    const a = messageKey({ timestamp: "t1", content: "hello world" });
    const b = messageKey({ timestamp: "t2", content: "hello world" });
    expect(a).not.toBe(b);
  });

  it("distinguishes messages with the same timestamp by content", () => {
    const a = messageKey({ timestamp: "t1", content: "aaa" });
    const b = messageKey({ timestamp: "t1", content: "bbb" });
    expect(a).not.toBe(b);
  });
});

describe("updateMessage", () => {
  it("replaces the message matching the key", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = {
      role: "user" as const,
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    useChatStore.getState().addMessage(msg);

    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: true,
    }));

    expect(useChatStore.getState().messages).toEqual([{ ...msg, failed: true }]);
  });

  it("clears a failed flag when a message is re-sent", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = {
      role: "user" as const,
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
      failed: true,
    };
    useChatStore.getState().addMessage(msg);

    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: false,
    }));

    expect(useChatStore.getState().messages[0].failed).toBe(false);
  });

  it("leaves other messages untouched", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const user = {
      role: "user" as const,
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const assistant = {
      role: "assistant" as const,
      content: "Hi there",
      timestamp: "2026-01-01T00:00:01.000Z",
    };
    useChatStore.getState().addMessage(user);
    useChatStore.getState().addMessage(assistant);

    useChatStore.getState().updateMessage(messageKey(assistant), (m) => ({
      ...m,
      content: "Regenerated answer",
    }));

    const [u, a] = useChatStore.getState().messages;
    expect(u).toEqual(user);
    expect(a.content).toBe("Regenerated answer");
  });

  it("does nothing when no message matches the key", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = {
      role: "user" as const,
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    useChatStore.getState().addMessage(msg);

    useChatStore.getState().updateMessage("no-such-key", (m) => ({
      ...m,
      failed: true,
    }));

    expect(useChatStore.getState().messages[0].failed).toBeUndefined();
  });
});

describe("thread persistence", () => {
  it("saves the failed flag with the thread on flush", async () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = {
      role: "user" as const,
      content: "Hello",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    useChatStore.getState().addMessage(msg);
    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: true,
    }));

    await flushChatSave();

    expect(writeTextFileMock).toHaveBeenCalled();
    const [path, data] = writeTextFileMock.mock.calls[0];
    expect(path).toBe("chat_app-1.json");
    expect(JSON.parse(data)).toEqual([{ ...msg, failed: true }]);
  });
});