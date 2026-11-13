import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
  deleteFile: vi.fn(),
}));

import { saveJson, loadJson, deleteFile } from "@/utils/storage";
import {
  useChatStore,
  messageKey,
  flushChatSave,
  flushDraftsSave,
  normalizeChatMessages,
  type ChatMessage,
} from "@/stores/chatStore";

const saveJsonMock = saveJson as Mock;
const loadJsonMock = loadJson as Mock;
const deleteFileMock = deleteFile as Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const userMessage = (content = "Hello"): ChatMessage => ({
  role: "user",
  content,
  timestamp: "2026-01-01T00:00:00.000Z",
});

beforeEach(async () => {
  // Drain any debounced save left over from the previous test so a stale
  // timer cannot fire into the next test's assertions.
  await flushChatSave();
  await flushDraftsSave();
  saveJsonMock.mockReset();
  loadJsonMock.mockReset();
  deleteFileMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  loadJsonMock.mockResolvedValue(null);
  deleteFileMock.mockResolvedValue(true);
  useChatStore.setState({
    messages: [],
    activeThreadId: null,
    threadLoaded: true,
    streamingText: "",
    error: null,
    isSending: false,
    drafts: {},
    draftsLoaded: false,
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

describe("normalizeChatMessages", () => {
  it("drops malformed entries instead of letting them crash the UI", () => {
    const messages = normalizeChatMessages([
      { role: "user", content: "ok", timestamp: "t1" },
      { role: "system", content: "no", timestamp: "t2" },
      { role: "assistant", content: 42, timestamp: "t3" },
      null,
      "nope",
      {
        role: "assistant",
        content: "also ok",
        timestamp: "t4",
        failed: true,
        purpose: "fit-evaluation",
        sources: [
          { title: "Example", url: "https://example.com/page" },
          { title: "Duplicate", url: "https://example.com/page" },
          { title: "Bad", url: "javascript:alert(1)" },
        ],
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.001,
      },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "ok", timestamp: "t1" },
      {
        role: "assistant",
        content: "also ok",
        timestamp: "t4",
        failed: true,
        purpose: "fit-evaluation",
        sources: [{ title: "Example", url: "https://example.com/page" }],
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.001,
      },
    ]);
  });

  it("returns an empty array for a non-array file", () => {
    expect(normalizeChatMessages({ messages: [] })).toEqual([]);
    expect(normalizeChatMessages(null)).toEqual([]);
  });
});

describe("updateMessage", () => {
  it("replaces the message matching the key", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = userMessage();
    useChatStore.getState().addMessage(msg);

    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: true,
    }));

    expect(useChatStore.getState().messages).toEqual([{ ...msg, failed: true }]);
  });

  it("clears a failed flag when a message is re-sent", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const msg = { ...userMessage(), failed: true };
    useChatStore.getState().addMessage(msg);

    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: false,
    }));

    expect(useChatStore.getState().messages[0].failed).toBe(false);
  });

  it("leaves other messages untouched", () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    const user = userMessage();
    const assistant: ChatMessage = {
      role: "assistant",
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
    const msg = userMessage();
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
    const msg = userMessage();
    useChatStore.getState().addMessage(msg);
    useChatStore.getState().updateMessage(messageKey(msg), (m) => ({
      ...m,
      failed: true,
    }));

    await flushChatSave();

    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-1.json", [
      { ...msg, failed: true },
    ]);
  });

  it("flushes the outgoing thread before switching to a new one", async () => {
    useChatStore.setState({ activeThreadId: "app-1", threadLoaded: true });
    const msg = userMessage();
    useChatStore.getState().addMessage(msg);

    await useChatStore.getState().switchThread("app-2");

    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-1.json", [msg]);
    expect(loadJsonMock).toHaveBeenCalledWith("chat_app-2.json");
  });

  it("ignores a stale load that finishes after a newer switch", async () => {
    const loadA = deferred<unknown>();
    const loadB = deferred<unknown>();
    loadJsonMock.mockImplementation((path: string) =>
      path === "chat_app-a.json" ? loadA.promise : loadB.promise,
    );

    const switchA = useChatStore.getState().switchThread("app-a");
    const switchB = useChatStore.getState().switchThread("app-b");

    loadB.resolve([userMessage("from B")]);
    await switchB;
    loadA.resolve([userMessage("from A")]);
    await switchA;

    expect(useChatStore.getState().activeThreadId).toBe("app-b");
    expect(useChatStore.getState().messages).toEqual([userMessage("from B")]);
  });

  it("appends an action result to an inactive thread instead of the visible one", async () => {
    useChatStore.setState({
      activeThreadId: "app-1",
      messages: [],
      threadLoaded: true,
    });
    const existing = userMessage("old thread message");
    const result = userMessage("improved draft");
    loadJsonMock.mockResolvedValue([existing]);

    await useChatStore.getState().appendMessageToThread("app-2", result);

    expect(loadJsonMock).toHaveBeenCalledWith("chat_app-2.json");
    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-2.json", [
      existing,
      result,
    ]);
    // The visible thread is untouched.
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("invalidates an in-flight load when the thread is reset", async () => {
    const load = deferred<unknown>();
    loadJsonMock.mockReturnValue(load.promise);

    const switching = useChatStore.getState().switchThread("app-1");
    // Let switchThread finish its flush and mark app-1 as the active thread.
    await Promise.resolve();
    await useChatStore.getState().clearMessages();
    load.resolve([userMessage("stale")]);
    await switching;

    expect(useChatStore.getState().messages).toEqual([]);
    expect(deleteFileMock).toHaveBeenCalledWith("chat_app-1.json");
  });

  it("forces a reload after an import even for the same thread", async () => {
    useChatStore.setState({
      activeThreadId: "app-1",
      messages: [userMessage("before import")],
      threadLoaded: true,
    });
    loadJsonMock.mockResolvedValue([userMessage("after import")]);

    await useChatStore.getState().switchThread("app-1", true);

    expect(loadJsonMock).toHaveBeenCalledWith("chat_app-1.json");
    expect(useChatStore.getState().messages).toEqual([userMessage("after import")]);
  });

  it("returns null-safe empty messages when a thread file is missing", async () => {
    loadJsonMock.mockResolvedValue(null);

    await useChatStore.getState().switchThread("app-1");

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().threadLoaded).toBe(true);
  });
});

describe("unsent drafts", () => {
  it("persists a draft on flush, dropping empty drafts", async () => {
    useChatStore.setState({
      activeThreadId: "app-1",
      drafts: { "app-1": "half-written", "app-2": "" },
    });

    await flushDraftsSave();

    expect(saveJsonMock).toHaveBeenCalledWith("drafts.json", {
      "app-1": "half-written",
    });
  });

  it("debounces setDraft and saves the current thread text", async () => {
    useChatStore.setState({ activeThreadId: "app-1" });
    useChatStore.getState().setDraft("hello");

    expect(useChatStore.getState().drafts["app-1"]).toBe("hello");
    await flushDraftsSave();

    expect(saveJsonMock).toHaveBeenCalledWith("drafts.json", {
      "app-1": "hello",
    });
  });

  it("loads saved drafts and keeps text typed while loading", async () => {
    useChatStore.setState({ drafts: { "app-1": "typed now" } });
    loadJsonMock.mockResolvedValue({
      "app-1": "older stored text",
      "app-2": "another draft",
    });

    await useChatStore.getState().loadDrafts();

    expect(useChatStore.getState().drafts).toEqual({
      "app-1": "typed now",
      "app-2": "another draft",
    });
    expect(useChatStore.getState().draftsLoaded).toBe(true);
  });

  it("replaces drafts on a forced reload and clears them when the file is missing", async () => {
    useChatStore.setState({
      drafts: { "app-1": "old" },
      draftsLoaded: true,
    });
    loadJsonMock.mockResolvedValue({ "app-2": "from backup" });

    await useChatStore.getState().loadDrafts(true);
    expect(useChatStore.getState().drafts).toEqual({
      "app-2": "from backup",
    });

    loadJsonMock.mockResolvedValue(null);
    await useChatStore.getState().loadDrafts(true);
    expect(useChatStore.getState().drafts).toEqual({});
  });

  it("removes a deleted application's draft", async () => {
    useChatStore.setState({
      activeThreadId: "app-1",
      drafts: { "app-1": "draft", "app-2": "keep" },
    });

    await useChatStore.getState().clearMessages();

    expect(useChatStore.getState().drafts).toEqual({ "app-2": "keep" });
  });
});
