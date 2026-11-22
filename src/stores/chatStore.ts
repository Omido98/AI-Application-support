import { create } from "zustand";
import {
  saveJson,
  loadJson,
  deleteFile,
  reportDataIssue,
} from "@/utils/storage";
import { createSaveQueue } from "@/utils/saveQueue";
import {
  normalizeApiConfigData,
  normalizeDraftsData,
  isRecord,
} from "@/utils/dataValidation";
import {
  API_KEY_ACCOUNT,
  deleteApiKeyFromKeychain,
  loadApiKeyFromKeychain,
  saveVerifiedApiKey,
} from "@/utils/keychain";
import type { ProviderId } from "@/utils/providers";
import { getProvider } from "@/utils/providers";
import { DEFAULT_CONTEXT_WINDOW } from "@/utils/tokens";
import type { TokenUsage, WebSource } from "@/types";
import { newMessageId } from "@/utils/ids";

export { newMessageId };

// ──────────────────────────────────────────────
// Chat message type (lighter than the full Message type)
// ──────────────────────────────────────────────

export interface ChatMessage {
  /** Stable identity, independent of content/timestamp. Generated on load for
   * files written before IDs existed. */
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** True when the send failed (no reply landed); shows a re-send action. */
  failed?: boolean;
  /**
   * Marks the user message that started the conversation through the
   * "Help me answer your application" starter. Keeping the intent on the
   * message means a failed first send can be retried without losing the
   * fit-evaluation prompt (and its forced web research).
   */
  purpose?: "fit-evaluation";
  /** Web sources consulted for this reply, shown as citation chips. */
  sources?: WebSource[];
  /** Provider-reported token usage for this reply, when available. */
  usage?: TokenUsage;
  /** Estimated USD cost from the static Zen price table, when known. */
  costUsd?: number;
  /**
   * Non-conversational artifacts produced by the refine actions. They are
   * rendered as review/suggestion cards and excluded from the model's history.
   */
  kind?: "review" | "improve" | "deslop" | "summary";
  /** For review/improve/deslop messages: the id of the source message. */
  sourceKey?: string;
}

/** Whether a message should be sent back to the model as conversation. */
export function isConversationMessage(msg: ChatMessage): boolean {
  return msg.kind === undefined;
}

/**
 * Legacy identity key used by chat files written before messages had stable
 * IDs. It still exists so old files can be migrated (timestamps + the first 40
 * characters were not unique enough to keep as the primary identity).
 */
export function messageKey(msg: {
  timestamp: string;
  content: string;
}): string {
  return msg.timestamp + msg.content.slice(0, 40);
}

/**
 * Validate a thread loaded from disk. A malformed or hand-edited file must
 * never crash the chat UI; invalid entries are dropped and the storage layer
 * reports the underlying problem. Missing IDs are generated, duplicate IDs
 * are replaced, and old `sourceKey` values are rewritten to the target's new
 * stable id.
 */
export function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  const usedIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const role = candidate.role;
    const content = candidate.content;
    const timestamp = candidate.timestamp;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      typeof timestamp !== "string"
    ) {
      continue;
    }
    let id =
      typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : newMessageId();
    if (usedIds.has(id)) id = newMessageId();
    usedIds.add(id);
    const sources = normalizeSources(candidate.sources);
    const usage = normalizeUsage(candidate.usage);
    const costUsd =
      typeof candidate.costUsd === "number" &&
      Number.isFinite(candidate.costUsd) &&
      candidate.costUsd >= 0
        ? candidate.costUsd
        : undefined;
    const kind =
      candidate.kind === "review" ||
      candidate.kind === "improve" ||
      candidate.kind === "deslop" ||
      candidate.kind === "summary"
        ? candidate.kind
        : undefined;
    const sourceKey =
      typeof candidate.sourceKey === "string" && candidate.sourceKey.length > 0
        ? candidate.sourceKey
        : undefined;
    messages.push({
      id,
      role,
      content,
      timestamp,
      ...(candidate.failed === true ? { failed: true } : {}),
      ...(candidate.purpose === "fit-evaluation"
        ? { purpose: "fit-evaluation" as const }
        : {}),
      ...(sources ? { sources } : {}),
      ...(usage ? { usage } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...(kind ? { kind } : {}),
      ...(sourceKey ? { sourceKey } : {}),
    });
  }

  // Old files point at their target with `timestamp + first 40 chars`. Rewrite
  // those references to the (possibly newly generated) stable id. References
  // that are already ids, or cannot be resolved, are left untouched.
  const legacyKeyToId = new Map<string, string>();
  for (const msg of messages) {
    const legacyKey = messageKey(msg);
    if (!legacyKeyToId.has(legacyKey)) {
      legacyKeyToId.set(legacyKey, msg.id);
    }
  }
  return messages.map((msg) => {
    if (!msg.sourceKey) return msg;
    const mapped = legacyKeyToId.get(msg.sourceKey);
    return mapped && mapped !== msg.id ? { ...msg, sourceKey: mapped } : msg;
  });
}

function normalizeSources(value: unknown): WebSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const title = entry.title;
    const url = entry.url;
    if (typeof title !== "string" || typeof url !== "string") continue;
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: title.trim() || url,
      url,
    });
  }
  return sources.length > 0 ? sources : undefined;
}

function normalizeUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const read = (field: unknown): number | undefined =>
    typeof field === "number" && Number.isFinite(field) && field >= 0
      ? Math.floor(field)
      : undefined;
  const inputTokens = read(value.inputTokens);
  const outputTokens = read(value.outputTokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

/** Copy an accepted suggestion into its source draft and drop the suggestion. */
function applySuggestion(
  messages: ChatMessage[],
  suggestionId: string,
  sourceId: string,
): ChatMessage[] | null {
  const suggestion = messages.find((msg) => msg.id === suggestionId);
  const source = messages.find((msg) => msg.id === sourceId);
  if (!suggestion || !source || suggestion === source) return null;
  return messages
    .map((msg) =>
      msg === source
        ? {
            ...msg,
            content: suggestion.content,
            sources: suggestion.sources,
            usage: suggestion.usage,
            costUsd: suggestion.costUsd,
          }
        : msg,
    )
    .filter((msg) => msg.id !== suggestionId);
}

// ──────────────────────────────────────────────
// API configuration
// ──────────────────────────────────────────────

export interface ApiConfig {
  /** Which LLM provider this config targets (determines endpoint & auth). */
  provider: ProviderId;
  baseUrl: string;
  /** In-memory only. The persisted config carries this ONLY when the key
   * could not be stored securely (see `sessionKeyOnly`); normally the key
   * lives in the OS keychain and the file holds just the account reference. */
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  /** Usable input context window in tokens. Older chat history is trimmed to
   * fit this budget, keeping replies from failing on long threads. */
  contextWindow: number;
  /** Whether the chat agent may use web search / page fetch tools. */
  webSearchEnabled: boolean;
  /** Which system prompt the chat agent uses. */
  systemPromptMode: "standard" | "custom";
  /** The user's custom prompt, used when systemPromptMode is "custom". */
  customSystemPrompt: string;
  /** Credential reference (NOT the secret): the keychain account holding the
   * key. Null when no credential is stored. */
  keychainAccount: string | null;
  /** True when the key could NOT be stored securely and therefore lives in
   * memory for this session only. */
  sessionKeyOnly: boolean;
}

export const ZEN_DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";

const defaultApiConfig: ApiConfig = {
  provider: "zen",
  baseUrl: ZEN_DEFAULT_BASE_URL,
  apiKey: "",
  model: "deepseek-v4-flash-free",
  reasoningEffort: null,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  webSearchEnabled: false,
  systemPromptMode: "standard",
  customSystemPrompt: "",
  keychainAccount: null,
  sessionKeyOnly: false,
};

/**
 * The config as written to disk: the key is stripped whenever the keychain
 * holds a verified copy, so config.json never carries a secret that is
 * already stored safely. A session-only key is the exception — it exists
 * nowhere else, so dropping it would lose it on the next launch.
 */
function persistableConfig(config: ApiConfig): ApiConfig {
  return config.sessionKeyOnly ? config : { ...config, apiKey: "" };
}

// ──────────────────────────────────────────────
// Per-thread state and debounced persistence
// ──────────────────────────────────────────────

/** Everything one application's chat thread owns. Threads stay in memory after
 * the user switches away, so a reply or refine result always lands in the
 * thread it was started from. */
export interface ThreadState {
  messages: ChatMessage[];
  /** True once the thread file has been read (or created). */
  loaded: boolean;
  /** True while the thread file is being read. */
  loading: boolean;
  /** Unsent composer text for this thread. */
  draft: string;
  /** Last error for this thread. */
  error: string | null;
  /** Whether a generation is currently streaming into this thread. */
  isSending: boolean;
  /** Text of the assistant message currently being generated. */
  streamingText: string;
}

function emptyThread(): ThreadState {
  return {
    messages: [],
    loaded: false,
    loading: false,
    draft: "",
    error: null,
    isSending: false,
    streamingText: "",
  };
}

const EMPTY_MESSAGES: ChatMessage[] = [];

/** Per-thread debounced save timers. */
const threadSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Per-thread write queues so two saves for one file cannot overlap. */
const threadSaveQueues = new Map<string, ReturnType<typeof createSaveQueue>>();

/** Threads whose files must not be recreated by a late save. */
const deletedThreads = new Set<string>();

function threadQueue(threadId: string) {
  const existing = threadSaveQueues.get(threadId);
  if (existing) return existing;
  const queue = createSaveQueue();
  threadSaveQueues.set(threadId, queue);
  return queue;
}

/** Monotonic token per thread, so a slow load cannot overwrite newer data. */
const threadLoadGeneration = new Map<string, number>();

/** Write one thread's current messages now. Missing/failed loads are skipped. */
async function saveThread(threadId: string): Promise<boolean> {
  return threadQueue(threadId).enqueue(async () => {
    if (deletedThreads.has(threadId)) return true;
    const thread = useChatStore.getState().threads[threadId];
    if (!thread || !thread.loaded) return true;
    return saveJson(`chat_${threadId}.json`, thread.messages);
  });
}

/**
 * Delete one thread file safely: stop its timer, wait for an in-flight write,
 * then remove the file. The thread stays blocked so a late save cannot
 * recreate it. Callers that want to write a new thread afterwards must clear
 * the marker (see `clearMessages`).
 */
export async function deleteChatThread(threadId: string): Promise<void> {
  deletedThreads.add(threadId);
  cancelThreadSave(threadId);
  const queue = threadSaveQueues.get(threadId);
  if (queue) {
    try {
      await queue.whenIdle();
    } catch {
      // A failed save must not prevent deletion.
    }
  }
  await deleteFile(`chat_${threadId}.json`);
}

/** Debounce a save of one thread; other threads' pending saves are untouched. */
function scheduleThreadSave(threadId: string) {
  const existing = threadSaveTimers.get(threadId);
  if (existing) clearTimeout(existing);
  threadSaveTimers.set(
    threadId,
    setTimeout(() => {
      threadSaveTimers.delete(threadId);
      void saveThread(threadId);
    }, 400),
  );
}

function cancelThreadSave(threadId: string) {
  const existing = threadSaveTimers.get(threadId);
  if (existing) {
    clearTimeout(existing);
    threadSaveTimers.delete(threadId);
  }
}

/**
 * Flush every pending thread save immediately. Returns false when any write
 * failed; the storage banner reports the reason.
 */
export async function flushChatSave(): Promise<boolean> {
  const timedIds = [...threadSaveTimers.keys()];
  for (const threadId of timedIds) {
    cancelThreadSave(threadId);
  }
  const queuedIds = [...threadSaveQueues.keys()].filter(
    (threadId) => !timedIds.includes(threadId),
  );
  const results = await Promise.all([
    ...timedIds.map((threadId) => saveThread(threadId)),
    ...queuedIds.map(
      (threadId) => threadSaveQueues.get(threadId)?.whenIdle() ?? true,
    ),
  ]);
  return results.every(Boolean);
}

// ──────────────────────────────────────────────
// Debounced draft save (all threads, one small file)
// ──────────────────────────────────────────────

const DRAFTS_FILE = "drafts.json";
let draftsSaveTimer: ReturnType<typeof setTimeout> | null = null;
const draftsSaveQueue = createSaveQueue();

function collectDrafts(
  threads: Record<string, ThreadState>,
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const [threadId, thread] of Object.entries(threads)) {
    if (threadId.length > 0 && thread.draft.length > 0) {
      drafts[threadId] = thread.draft;
    }
  }
  return drafts;
}

/** Capture the drafts file payload at write time, not schedule time. */
function writeDraftsSnapshot(): Promise<boolean> {
  const state = useChatStore.getState();
  const drafts = collectDrafts(state.threads);
  // Never overwrite the stored drafts with an empty object before the startup
  // load has completed.
  if (!state.draftsLoaded && Object.keys(drafts).length === 0) {
    return Promise.resolve(true);
  }
  return saveJson(DRAFTS_FILE, drafts);
}

function scheduleDraftsSave() {
  if (draftsSaveTimer) clearTimeout(draftsSaveTimer);
  draftsSaveTimer = setTimeout(() => {
    draftsSaveTimer = null;
    void draftsSaveQueue.enqueue(writeDraftsSnapshot);
  }, 500);
}

/** Flush unsent drafts immediately (window close / explicit flush). */
export async function flushDraftsSave(): Promise<boolean> {
  if (draftsSaveTimer) {
    clearTimeout(draftsSaveTimer);
    draftsSaveTimer = null;
  }
  // Always write the current snapshot, behind any write already in flight.
  return draftsSaveQueue.enqueue(writeDraftsSnapshot);
}

// ──────────────────────────────────────────────
// Thread loading
// ──────────────────────────────────────────────

/**
 * Read a thread file into the per-thread cache without changing which thread
 * is on screen. Concurrent callers for the same thread share the generation
 * guard, and a cache reset invalidates any in-flight load.
 */
async function loadThread(threadId: string, force = false): Promise<void> {
  const current = useChatStore.getState();
  if (!force && current.threads[threadId]?.loaded) return;
  const generation = (threadLoadGeneration.get(threadId) ?? 0) + 1;
  threadLoadGeneration.set(threadId, generation);
  useChatStore.setState((state) => ({
    threads: {
      ...state.threads,
      [threadId]: {
        ...(state.threads[threadId] ?? emptyThread()),
        loading: true,
      },
    },
  }));

  const data = await loadJson<unknown>(`chat_${threadId}.json`);
  if (threadLoadGeneration.get(threadId) !== generation) return;
  useChatStore.setState((state) => {
    // The cache was reset while the read was in flight: do not resurrect it.
    if (!(threadId in state.threads)) return {};
    const thread = state.threads[threadId];
    return {
      threads: {
        ...state.threads,
        [threadId]: {
          ...thread,
          messages: normalizeChatMessages(data),
          loaded: true,
          loading: false,
        },
      },
    };
  });
  if (useChatStore.getState().threads[threadId]) {
    deletedThreads.delete(threadId);
  }
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ChatState {
  /** Chat threads by application id. Populated lazily from disk. */
  threads: Record<string, ThreadState>;
  /** Which thread the UI currently shows. */
  activeThreadId: string | null;

  /** Whether config has been loaded from disk */
  configLoaded: boolean;
  /** Whether drafts.json has been read for this launch. */
  draftsLoaded: boolean;

  /** API configuration */
  config: ApiConfig;

  // Message actions (all target a specific thread)
  addMessage: (threadId: string, msg: ChatMessage) => void;
  /** Replace a message by stable id. */
  updateMessage: (
    threadId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage,
  ) => void;
  /** Append a message to a thread, active or not (loads it when needed). */
  appendMessageToThread: (
    threadId: string,
    msg: ChatMessage,
    signal?: AbortSignal,
  ) => Promise<void>;
  /** Replace a message in a thread, active or not. */
  updateMessageInThread: (
    threadId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage,
    signal?: AbortSignal,
  ) => Promise<void>;
  /** Remove one message from a thread (discarding a suggestion or review). */
  removeMessageInThread: (threadId: string, messageId: string) => Promise<void>;
  /**
   * Accept an improve/deslop suggestion: replace the source draft's content
   * with the suggestion and remove the suggestion message in one write.
   */
  acceptSuggestion: (
    threadId: string,
    suggestionId: string,
    sourceId: string,
  ) => Promise<void>;
  clearMessages: () => Promise<void>;
  /** Load (or reset) the chat thread for an application. `force` reloads even
   * when the same thread is already loaded (used after importing a backup). */
  switchThread: (
    applicationId: string | null,
    force?: boolean,
  ) => Promise<void>;
  /** Drop every cached thread (used after importing a backup). */
  resetThreadCache: () => void;
  /** Load persisted unsent drafts. `force` replaces in-memory drafts instead
   * of merging over them (used after importing a backup). */
  loadDrafts: (force?: boolean) => Promise<void>;
  /** Remove the draft belonging to a deleted application. */
  discardDraft: (threadId: string) => void;

  // Per-thread streaming state
  setThreadSending: (threadId: string, sending: boolean) => void;
  setThreadError: (threadId: string, error: string | null) => void;
  /** Set the live-streamed assistant text (string, or updater for appends). */
  setThreadStreamingText: (
    threadId: string,
    updater: string | ((prev: string) => string),
  ) => void;

  // Config actions
  /** Merge the given fields into the stored config and persist the result. */
  setConfig: (cfg: Partial<ApiConfig>) => Promise<void>;
  loadConfig: () => Promise<void>;
  /** Mark config as not yet configured (e.g. user clicks Edit) */
  resetConfig: () => void;

  /** Save the unsent message draft for the current thread. */
  setDraft: (value: string) => void;
}

/** True while any thread has a generation in flight. */
export function selectAnyThreadSending(state: ChatState): boolean {
  return Object.values(state.threads).some((thread) => thread.isSending);
}

/** Messages of the active thread (stable empty array when none). */
export function selectActiveMessages(state: ChatState): ChatMessage[] {
  const threadId = state.activeThreadId;
  if (!threadId) return EMPTY_MESSAGES;
  return state.threads[threadId]?.messages ?? EMPTY_MESSAGES;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  threads: {},
  activeThreadId: null,
  configLoaded: false,
  draftsLoaded: false,

  config: { ...defaultApiConfig },

  // ── Messages ──

  addMessage: (threadId, msg) => {
    set((s) => {
      const thread = s.threads[threadId] ?? emptyThread();
      return {
        threads: {
          ...s.threads,
          [threadId]: {
            ...thread,
            messages: [...thread.messages, msg],
            loaded: true,
          },
        },
      };
    });
    scheduleThreadSave(threadId);
  },

  updateMessage: (threadId, messageId, updater) => {
    let changed = false;
    set((s) => {
      const thread = s.threads[threadId];
      if (!thread) return {};
      const messages = thread.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        changed = true;
        return updater(msg);
      });
      if (!changed) return {};
      return {
        threads: {
          ...s.threads,
          [threadId]: { ...thread, messages },
        },
      };
    });
    if (changed) scheduleThreadSave(threadId);
  },

  appendMessageToThread: async (threadId, msg, signal) => {
    await loadThread(threadId);
    if (signal?.aborted) return;
    set((s) => {
      const thread = s.threads[threadId] ?? emptyThread();
      return {
        threads: {
          ...s.threads,
          [threadId]: {
            ...thread,
            messages: [...thread.messages, msg],
            loaded: true,
          },
        },
      };
    });
    scheduleThreadSave(threadId);
  },

  updateMessageInThread: async (threadId, messageId, updater, signal) => {
    await loadThread(threadId);
    if (signal?.aborted) return;
    let changed = false;
    set((s) => {
      const thread = s.threads[threadId];
      if (!thread) return {};
      const messages = thread.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        changed = true;
        return updater(msg);
      });
      if (!changed) return {};
      return {
        threads: {
          ...s.threads,
          [threadId]: { ...thread, messages },
        },
      };
    });
    if (changed) scheduleThreadSave(threadId);
  },

  removeMessageInThread: async (threadId, messageId) => {
    await loadThread(threadId);
    let changed = false;
    set((s) => {
      const thread = s.threads[threadId];
      if (!thread) return {};
      const messages = thread.messages.filter((msg) => msg.id !== messageId);
      if (messages.length === thread.messages.length) return {};
      changed = true;
      return {
        threads: {
          ...s.threads,
          [threadId]: { ...thread, messages },
        },
      };
    });
    if (changed) scheduleThreadSave(threadId);
  },

  acceptSuggestion: async (threadId, suggestionId, sourceId) => {
    await loadThread(threadId);
    let next: ChatMessage[] | null = null;
    set((s) => {
      const thread = s.threads[threadId];
      if (!thread) return {};
      next = applySuggestion(thread.messages, suggestionId, sourceId);
      if (!next) return {};
      return {
        threads: {
          ...s.threads,
          [threadId]: { ...thread, messages: next },
        },
      };
    });
    if (next) scheduleThreadSave(threadId);
  },

  clearMessages: async () => {
    const threadId = get().activeThreadId;
    if (!threadId) return;
    // Invalidate any in-flight load so it cannot repopulate the cleared thread.
    threadLoadGeneration.set(
      threadId,
      (threadLoadGeneration.get(threadId) ?? 0) + 1,
    );
    cancelThreadSave(threadId);
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: {
          ...(s.threads[threadId] ?? emptyThread()),
          messages: [],
          draft: "",
          error: null,
          isSending: false,
          streamingText: "",
          loaded: true,
          loading: false,
        },
      },
    }));
    scheduleDraftsSave();
    await deleteChatThread(threadId);
    // The thread now exists again (empty), so a new message may save it.
    deletedThreads.delete(threadId);
  },

  switchThread: async (applicationId, force = false) => {
    if (!applicationId) {
      set({ activeThreadId: null });
      return;
    }
    set({ activeThreadId: applicationId });
    await loadThread(applicationId, force);
  },

  resetThreadCache: () => {
    // The caller flushes writes before a backup import, so there is nothing
    // worth blocking after a reset; restored threads are loaded on demand.
    deletedThreads.clear();
    for (const timer of threadSaveTimers.values()) clearTimeout(timer);
    threadSaveTimers.clear();
    threadSaveQueues.clear();
    threadLoadGeneration.clear();
    set({ threads: {}, activeThreadId: null });
  },

  loadDrafts: async (force = false) => {
    const raw = await loadJson<unknown>(DRAFTS_FILE);
    if (raw == null) {
      // A missing file is normal. On a forced reload (import) it means the
      // restored backup has no drafts, so clear the old ones.
      if (!force) {
        set({ draftsLoaded: true });
        return;
      }
      set((s) => {
        const threads: Record<string, ThreadState> = {};
        for (const [threadId, thread] of Object.entries(s.threads)) {
          threads[threadId] = { ...thread, draft: "" };
        }
        return { threads, draftsLoaded: true };
      });
      return;
    }
    const loaded = normalizeDraftsData(raw);
    if (!loaded) {
      reportDataIssue(
        DRAFTS_FILE,
        "The drafts file has an unexpected structure. Unsaved drafts from the previous session were not restored.",
      );
      set({ draftsLoaded: true });
      return;
    }
    set((s) => {
      const threads: Record<string, ThreadState> = {};
      for (const [threadId, thread] of Object.entries(s.threads)) {
        // A forced reload replaces drafts; a normal load keeps text typed
        // while the file was being read.
        threads[threadId] = {
          ...thread,
          draft: force ? "" : thread.draft,
        };
      }
      for (const [threadId, draft] of Object.entries(loaded)) {
        const thread = threads[threadId] ?? emptyThread();
        threads[threadId] = {
          ...thread,
          draft: force ? draft : thread.draft || draft,
        };
      }
      return { threads, draftsLoaded: true };
    });
  },

  discardDraft: (threadId) => {
    const thread = get().threads[threadId];
    if (!thread || thread.draft.length === 0) return;
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: { ...thread, draft: "" },
      },
    }));
    scheduleDraftsSave();
  },

  // ── Streaming state ──

  setThreadSending: (threadId, sending) => {
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: {
          ...(s.threads[threadId] ?? emptyThread()),
          isSending: sending,
        },
      },
    }));
  },

  setThreadError: (threadId, error) => {
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: {
          ...(s.threads[threadId] ?? emptyThread()),
          error,
        },
      },
    }));
  },

  setThreadStreamingText: (threadId, updater) => {
    set((s) => {
      const thread = s.threads[threadId] ?? emptyThread();
      return {
        threads: {
          ...s.threads,
          [threadId]: {
            ...thread,
            streamingText:
              typeof updater === "function"
                ? updater(thread.streamingText)
                : updater,
          },
        },
      };
    });
  },

  // ── Config ──

  setConfig: async (cfg) => {
    const next = { ...get().config, ...cfg };
    // The key goes to the OS keychain, verified. Only if that fails does the
    // persisted config keep a plaintext copy (see persistableConfig), which
    // makes the file the exception rather than the rule.
    if (cfg.apiKey) {
      const stored = await saveVerifiedApiKey(cfg.apiKey);
      next.keychainAccount = stored ? API_KEY_ACCOUNT : null;
      next.sessionKeyOnly = !stored;
    } else if (cfg.apiKey !== undefined) {
      // Key explicitly cleared: remove the stored entry so an old key cannot
      // resurface on the next launch.
      await deleteApiKeyFromKeychain();
      next.keychainAccount = null;
      next.sessionKeyOnly = false;
    }
    set({ config: next });
    await saveJson("config.json", persistableConfig(next));
  },

  loadConfig: async () => {
    const raw = await loadJson<unknown>("config.json");
    const data = raw ? normalizeApiConfigData(raw) : null;
    if (raw && !data) {
      reportDataIssue(
        "config.json",
        "The file has an unexpected structure. Default API settings were used.",
      );
    }
    // Prefer a key in the OS keychain over one in the file.
    let keychainKey = await loadApiKeyFromKeychain();
    let sessionKeyOnly = false;
    if (keychainKey == null && data?.apiKey) {
      // A pre-upgrade install (or a session that could not use the
      // keychain) still has the key in config.json. Move it into the
      // keychain and drop the plaintext copy ONLY after a verified write;
      // if the keychain refuses it, the key stays usable this session and
      // the file is left untouched (recoverability beats cleanup).
      if (await saveVerifiedApiKey(data.apiKey)) {
        keychainKey = data.apiKey;
        await saveJson(
          "config.json",
          persistableConfig({ ...data, apiKey: "" }),
        );
      } else {
        sessionKeyOnly = true;
      }
    }
    const key = keychainKey ?? data?.apiKey ?? "";
    const withDefaults = (base: ApiConfig): ApiConfig => {
      const provider = getProvider(base.provider);
      return {
        ...base,
        baseUrl: base.baseUrl || provider.defaultBaseUrl,
        model: base.model || provider.defaultModel,
        apiKey: key,
        keychainAccount: keychainKey != null ? API_KEY_ACCOUNT : null,
        sessionKeyOnly,
        reasoningEffort: base.reasoningEffort ?? null,
        contextWindow: base.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
        webSearchEnabled: base.webSearchEnabled ?? false,
        systemPromptMode: base.systemPromptMode ?? "standard",
        customSystemPrompt: base.customSystemPrompt ?? "",
      };
    };
    if (data) {
      // Migrate the old, non-existent endpoint to the real OpenCode Zen URL
      if (
        data.baseUrl.includes("api.opencode.ai") &&
        !data.baseUrl.includes("opencode.ai/zen")
      ) {
        data.baseUrl = ZEN_DEFAULT_BASE_URL;
        data.provider = "zen";
      }
      set({ config: withDefaults(data), configLoaded: true });
    } else {
      set({
        config: withDefaults({ ...defaultApiConfig }),
        configLoaded: true,
      });
    }
  },
  resetConfig: () => {
    set({ config: { ...defaultApiConfig }, configLoaded: false });
  },

  setDraft: (value) => {
    const threadId = get().activeThreadId;
    if (!threadId) return;
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: {
          ...(s.threads[threadId] ?? emptyThread()),
          draft: value,
        },
      },
    }));
    scheduleDraftsSave();
  },
}));

/** Load a thread without switching the active chat tab (used by the CV builder). */
export async function loadChatMessagesFor(
  applicationId: string,
): Promise<ChatMessage[]> {
  await loadThread(applicationId);
  return useChatStore.getState().threads[applicationId]?.messages ?? [];
}
