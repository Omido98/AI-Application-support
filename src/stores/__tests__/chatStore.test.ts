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
  newMessageId,
  flushChatSave,
  flushDraftsSave,
  isConversationMessage,
  normalizeChatMessages,
  selectActiveMessages,
  selectAnyThreadSending,
  type ChatMessage,
  type ThreadState,
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

function thread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    messages: [],
    loaded: true,
    loading: false,
    draft: "",
    error: null,
    isSending: false,
    streamingText: "",
    ...overrides,
  };
}

const userMessage = (content = "Hello", id = newMessageId()): ChatMessage => ({
  id,
  role: "user",
  content,
  timestamp: "2026-01-01T00:00:00.000Z",
});

const assistantMessage = (
  content = "Hi there",
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: newMessageId(),
  role: "assistant",
  content,
  timestamp: "2026-01-01T00:00:01.000Z",
  ...overrides,
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
    threads: {},
    activeThreadId: null,
    draftsLoaded: false,
  });
});

describe("message identity", () => {
  it("generates unique ids", () => {
    expect(newMessageId()).not.toBe(newMessageId());
  });

  it("keeps the legacy key only as a migration aid", () => {
    const a = messageKey({ timestamp: "t1", content: "hello world" });
    const b = messageKey({ timestamp: "t2", content: "hello world" });
    const c = messageKey({ timestamp: "t1", content: "different" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
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
        id: "existing-id",
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
        kind: "improve",
        sourceKey: "t1ok",
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      id: expect.any(String),
      role: "user",
      content: "ok",
      timestamp: "t1",
    });
    expect(messages[1]).toMatchObject({
      id: "existing-id",
      role: "assistant",
      content: "also ok",
      timestamp: "t4",
      failed: true,
      purpose: "fit-evaluation",
      sources: [{ title: "Example", url: "https://example.com/page" }],
      usage: { inputTokens: 10, outputTokens: 5 },
      costUsd: 0.001,
      kind: "improve",
    });
    // The old timestamp+content reference was rewritten to the target's id.
    expect(messages[1].sourceKey).toBe(messages[0].id);
  });

  it("generates ids for old files and preserves ids that already exist", () => {
    const messages = normalizeChatMessages([
      { role: "user", content: "old", timestamp: "t1" },
      { id: "kept", role: "assistant", content: "new", timestamp: "t2" },
    ]);

    expect(messages[0].id).toEqual(expect.any(String));
    expect(messages[1].id).toBe("kept");
  });

  it("replaces duplicate ids so every message stays distinct", () => {
    const messages = normalizeChatMessages([
      { id: "same", role: "user", content: "one", timestamp: "t1" },
      { id: "same", role: "user", content: "two", timestamp: "t2" },
    ]);

    expect(messages[0].id).toBe("same");
    expect(messages[1].id).not.toBe("same");
    expect(messages[1].id).toEqual(expect.any(String));
  });

  it("leaves a sourceKey that already points at an id untouched", () => {
    const messages = normalizeChatMessages([
      { id: "target", role: "assistant", content: "draft", timestamp: "t1" },
      {
        id: "suggestion",
        role: "assistant",
        content: "better",
        timestamp: "t2",
        kind: "improve",
        sourceKey: "target",
      },
    ]);

    expect(messages[1].sourceKey).toBe("target");
  });

  it("returns an empty array for a non-array file", () => {
    expect(normalizeChatMessages({ messages: [] })).toEqual([]);
    expect(normalizeChatMessages(null)).toEqual([]);
  });
});

describe("per-thread message actions", () => {
  it("updates the message with the matching stable id", () => {
    const msg = userMessage();
    useChatStore.setState({ threads: { "app-1": thread() } });

    useChatStore.getState().addMessage("app-1", msg);
    useChatStore.getState().updateMessage("app-1", msg.id, (m) => ({
      ...m,
      failed: true,
    }));

    expect(useChatStore.getState().threads["app-1"].messages).toEqual([
      { ...msg, failed: true },
    ]);
  });

  it("does not touch another thread's messages", () => {
    const a = userMessage("A");
    const b = userMessage("B");
    useChatStore.setState({
      threads: { "app-1": thread(), "app-2": thread() },
    });

    useChatStore.getState().addMessage("app-1", a);
    useChatStore.getState().addMessage("app-2", b);
    useChatStore.getState().updateMessage("app-1", a.id, (m) => ({
      ...m,
      content: "A updated",
    }));

    expect(useChatStore.getState().threads["app-2"].messages).toEqual([b]);
  });

  it("does nothing when no message matches the id", () => {
    const msg = userMessage();
    useChatStore.setState({ threads: { "app-1": thread() } });
    useChatStore.getState().addMessage("app-1", msg);

    useChatStore.getState().updateMessage("app-1", "no-such-id", (m) => ({
      ...m,
      failed: true,
    }));

    expect(
      useChatStore.getState().threads["app-1"].messages[0].failed,
    ).toBeUndefined();
  });

  it("updates a thread that is not on screen", async () => {
    const a = userMessage("A");
    useChatStore.setState({
      threads: { "app-1": thread({ messages: [a] }), "app-2": thread() },
      activeThreadId: "app-2",
    });

    await useChatStore.getState().updateMessageInThread("app-1", a.id, (m) => ({
      ...m,
      content: "A updated",
    }));

    expect(useChatStore.getState().threads["app-1"].messages[0].content).toBe(
      "A updated",
    );
    expect(useChatStore.getState().threads["app-2"].messages).toEqual([]);
  });
});

describe("thread switching and caching", () => {
  it("loads a thread once and serves it from cache afterwards", async () => {
    loadJsonMock.mockResolvedValue([userMessage("from disk")]);
    useChatStore.setState({ threads: {} });

    await useChatStore.getState().switchThread("app-1");
    expect(useChatStore.getState().threads["app-1"]).toMatchObject({
      loaded: true,
      loading: false,
    });
    expect(useChatStore.getState().threads["app-1"].messages).toHaveLength(1);

    await useChatStore.getState().switchThread("app-2");
    await useChatStore.getState().switchThread("app-1");
    expect(loadJsonMock).toHaveBeenCalledTimes(2);
  });

  it("keeps both threads when loads finish out of order", async () => {
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
    expect(useChatStore.getState().threads["app-a"].messages[0].content).toBe(
      "from A",
    );
    expect(useChatStore.getState().threads["app-b"].messages[0].content).toBe(
      "from B",
    );
  });

  it("forces a reload after an import even for a cached thread", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ messages: [userMessage("before import")] }),
      },
      activeThreadId: "app-1",
    });
    loadJsonMock.mockResolvedValue([userMessage("after import")]);

    await useChatStore.getState().switchThread("app-1", true);

    expect(loadJsonMock).toHaveBeenCalledWith("chat_app-1.json");
    expect(useChatStore.getState().threads["app-1"].messages[0].content).toBe(
      "after import",
    );
  });

  it("treats a missing thread file as an empty loaded thread", async () => {
    loadJsonMock.mockResolvedValue(null);

    await useChatStore.getState().switchThread("app-1");

    expect(useChatStore.getState().threads["app-1"].messages).toEqual([]);
    expect(useChatStore.getState().threads["app-1"].loaded).toBe(true);
  });

  it("does not resurrect a thread after the cache is reset", async () => {
    const load = deferred<unknown>();
    loadJsonMock.mockReturnValue(load.promise);

    const switching = useChatStore.getState().switchThread("app-1");
    useChatStore.getState().resetThreadCache();
    load.resolve([userMessage("stale")]);
    await switching;

    expect(useChatStore.getState().threads).toEqual({});
    expect(useChatStore.getState().activeThreadId).toBeNull();
  });
});

describe("thread persistence", () => {
  it("saves every dirty thread on flush", async () => {
    const a = userMessage("A");
    const b = assistantMessage("B");
    useChatStore.setState({
      threads: { "app-1": thread(), "app-2": thread() },
    });

    useChatStore.getState().addMessage("app-1", a);
    useChatStore.getState().addMessage("app-2", b);
    await flushChatSave();

    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-1.json", [a]);
    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-2.json", [b]);
  });

  it("appends an action result to an inactive cached thread", async () => {
    const existing = userMessage("old thread message");
    const result = assistantMessage("improved draft");
    useChatStore.setState({
      threads: { "app-1": thread({ messages: [existing] }), "app-2": thread() },
      activeThreadId: "app-2",
    });

    await useChatStore.getState().appendMessageToThread("app-2", result);
    await flushChatSave();

    expect(useChatStore.getState().threads["app-2"].messages).toEqual([result]);
    expect(useChatStore.getState().threads["app-1"].messages).toEqual([
      existing,
    ]);
    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-2.json", [result]);
  });

  it("loads an uncached thread before appending to it", async () => {
    const existing = userMessage("from disk");
    const result = assistantMessage("new result");
    useChatStore.setState({
      threads: { "app-1": thread() },
      activeThreadId: "app-1",
    });
    loadJsonMock.mockResolvedValue([existing]);

    await useChatStore.getState().appendMessageToThread("app-2", result);
    await flushChatSave();

    expect(useChatStore.getState().threads["app-2"].messages).toHaveLength(2);
    expect(useChatStore.getState().threads["app-2"].messages[1]).toEqual(
      result,
    );
    expect(saveJsonMock).toHaveBeenCalledWith(
      "chat_app-2.json",
      useChatStore.getState().threads["app-2"].messages,
    );
  });

  it("persists generated ids when an old file is loaded and extended", async () => {
    loadJsonMock.mockResolvedValue([
      { role: "user", content: "old message", timestamp: "t1" },
    ]);

    await useChatStore.getState().switchThread("app-1");
    const loaded = useChatStore.getState().threads["app-1"].messages[0];
    expect(loaded.id).toEqual(expect.any(String));

    useChatStore.getState().addMessage("app-1", assistantMessage("new reply"));
    await flushChatSave();

    const call = saveJsonMock.mock.calls.find(
      ([name]) => name === "chat_app-1.json",
    );
    const saved = call?.[1] as ChatMessage[];
    expect(saved[0].id).toBe(loaded.id);
    expect(saved[1].id).toEqual(expect.any(String));
  });

  it("clears a thread and deletes its file without saving the old messages", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({
          messages: [userMessage("old")],
          draft: "unsent",
        }),
      },
      activeThreadId: "app-1",
      draftsLoaded: true,
    });

    await useChatStore.getState().clearMessages();
    await flushChatSave();

    const cleared = useChatStore.getState().threads["app-1"];
    expect(cleared.messages).toEqual([]);
    expect(cleared.draft).toBe("");
    expect(cleared.isSending).toBe(false);
    expect(deleteFileMock).toHaveBeenCalledWith("chat_app-1.json");
    expect(saveJsonMock).not.toHaveBeenCalledWith("chat_app-1.json", [
      expect.objectContaining({ content: "old" }),
    ]);
  });
});

describe("per-thread streaming state", () => {
  it("keeps sending, streaming text, and errors independent per thread", () => {
    useChatStore.setState({
      threads: { "app-1": thread(), "app-2": thread() },
    });

    useChatStore.getState().setThreadSending("app-1", true);
    useChatStore.getState().setThreadStreamingText("app-1", "Hel");
    useChatStore
      .getState()
      .setThreadStreamingText("app-1", (prev) => prev + "lo");
    useChatStore.getState().setThreadError("app-2", "boom");

    const state = useChatStore.getState();
    expect(state.threads["app-1"].isSending).toBe(true);
    expect(state.threads["app-1"].streamingText).toBe("Hello");
    expect(state.threads["app-2"].isSending).toBe(false);
    expect(state.threads["app-2"].streamingText).toBe("");
    expect(state.threads["app-2"].error).toBe("boom");
    expect(selectAnyThreadSending(state)).toBe(true);

    useChatStore.getState().setThreadSending("app-1", false);
    expect(selectAnyThreadSending(useChatStore.getState())).toBe(false);
  });

  it("writes a completed reply to its origin thread after a switch", () => {
    useChatStore.setState({
      threads: {
        "app-a": thread({ isSending: true, streamingText: "Hello" }),
        "app-b": thread(),
      },
      activeThreadId: "app-a",
    });

    useChatStore.setState({ activeThreadId: "app-b" });
    const reply = assistantMessage("Hello from A");
    useChatStore.getState().addMessage("app-a", reply);
    useChatStore.getState().setThreadSending("app-a", false);
    useChatStore.getState().setThreadStreamingText("app-a", "");

    const state = useChatStore.getState();
    expect(state.activeThreadId).toBe("app-b");
    expect(state.threads["app-a"].messages).toEqual([reply]);
    expect(state.threads["app-a"].isSending).toBe(false);
    expect(state.threads["app-b"].messages).toEqual([]);
  });

  it("selects the active thread's messages", () => {
    const a = userMessage("A");
    useChatStore.setState({
      threads: { "app-1": thread({ messages: [a] }), "app-2": thread() },
      activeThreadId: "app-1",
    });
    expect(selectActiveMessages(useChatStore.getState())).toEqual([a]);

    useChatStore.setState({ activeThreadId: null });
    expect(selectActiveMessages(useChatStore.getState())).toEqual([]);
  });
});

describe("unsent drafts", () => {
  it("persists a draft on flush, dropping empty drafts", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ draft: "half-written" }),
        "app-2": thread({ draft: "" }),
      },
      draftsLoaded: true,
    });

    await flushDraftsSave();

    expect(saveJsonMock).toHaveBeenCalledWith("drafts.json", {
      "app-1": "half-written",
    });
  });

  it("debounces setDraft and saves the active thread text", async () => {
    useChatStore.setState({
      threads: { "app-1": thread() },
      activeThreadId: "app-1",
      draftsLoaded: true,
    });
    useChatStore.getState().setDraft("hello");

    expect(useChatStore.getState().threads["app-1"].draft).toBe("hello");
    await flushDraftsSave();

    expect(saveJsonMock).toHaveBeenCalledWith("drafts.json", {
      "app-1": "hello",
    });
  });

  it("loads saved drafts into thread state, keeping text typed meanwhile", async () => {
    useChatStore.setState({
      threads: { "app-1": thread({ draft: "typed now" }) },
    });
    loadJsonMock.mockResolvedValue({
      "app-1": "older stored text",
      "app-2": "another draft",
    });

    await useChatStore.getState().loadDrafts();

    expect(useChatStore.getState().threads["app-1"].draft).toBe("typed now");
    expect(useChatStore.getState().threads["app-2"].draft).toBe(
      "another draft",
    );
    expect(useChatStore.getState().draftsLoaded).toBe(true);
  });

  it("replaces drafts on a forced reload and clears them when the file is missing", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ draft: "old" }),
        "app-3": thread({ draft: "gone" }),
      },
      draftsLoaded: true,
    });
    loadJsonMock.mockResolvedValue({ "app-2": "from backup" });

    await useChatStore.getState().loadDrafts(true);
    expect(useChatStore.getState().threads["app-1"].draft).toBe("");
    expect(useChatStore.getState().threads["app-3"].draft).toBe("");
    expect(useChatStore.getState().threads["app-2"].draft).toBe("from backup");

    loadJsonMock.mockResolvedValue(null);
    await useChatStore.getState().loadDrafts(true);
    expect(useChatStore.getState().threads["app-2"].draft).toBe("");
  });

  it("removes a deleted application's draft", () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ draft: "draft" }),
        "app-2": thread({ draft: "keep" }),
      },
    });

    useChatStore.getState().discardDraft("app-1");

    expect(useChatStore.getState().threads["app-1"].draft).toBe("");
    expect(useChatStore.getState().threads["app-2"].draft).toBe("keep");
  });
});

describe("suggestions and reviews", () => {
  const source = assistantMessage("Old draft", { id: "source-id" });
  const suggestion = assistantMessage("New draft", {
    id: "suggestion-id",
    kind: "improve",
    sourceKey: source.id,
    sources: [{ title: "Example", url: "https://example.com" }],
  });

  it("keeps artifacts out of the model conversation", () => {
    expect(isConversationMessage(source)).toBe(true);
    expect(isConversationMessage(suggestion)).toBe(false);
    expect(isConversationMessage({ ...source, kind: "review" })).toBe(false);
    expect(isConversationMessage({ ...source, kind: "summary" })).toBe(false);
  });

  it("accepts a suggestion by id, replacing the source and removing the card", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ messages: [source, suggestion] }),
      },
      activeThreadId: "app-1",
    });

    await useChatStore
      .getState()
      .acceptSuggestion("app-1", suggestion.id, source.id);

    expect(useChatStore.getState().threads["app-1"].messages).toEqual([
      {
        ...source,
        content: "New draft",
        sources: suggestion.sources,
      },
    ]);

    await flushChatSave();
    expect(saveJsonMock).toHaveBeenCalledWith("chat_app-1.json", [
      {
        ...source,
        content: "New draft",
        sources: suggestion.sources,
      },
    ]);
  });

  it("discards a suggestion without touching the source", async () => {
    useChatStore.setState({
      threads: {
        "app-1": thread({ messages: [source, suggestion] }),
      },
      activeThreadId: "app-1",
    });

    await useChatStore.getState().removeMessageInThread("app-1", suggestion.id);

    expect(useChatStore.getState().threads["app-1"].messages).toEqual([source]);
  });
});
