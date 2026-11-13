import { create } from "zustand";
import { saveJson, loadJson, deleteFile, reportDataIssue } from "@/utils/storage";
import { normalizeApiConfigData, normalizeDraftsData } from "@/utils/dataValidation";
import {
  API_KEY_ACCOUNT,
  deleteApiKeyFromKeychain,
  loadApiKeyFromKeychain,
  saveVerifiedApiKey,
} from "@/utils/keychain";
import type { ProviderId } from "@/utils/providers";
import { getProvider } from "@/utils/providers";

// ──────────────────────────────────────────────
// Chat message type (lighter than the full Message type)
// ──────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** True when the send failed (no reply landed); shows a re-send action. */
  failed?: boolean;
  /**
   * Marks the user message that started the conversation through the
   * "Help me answer my application" starter. Keeping the intent on the
   * message means a failed first send can be retried without losing the
   * fit-evaluation prompt (and its forced web research).
   */
  purpose?: "fit-evaluation";
}

/**
 * Stable identity key for a message, used by action buttons and re-sends.
 * Matches the key the UI computes for each rendered message.
 */
export function messageKey(msg: { timestamp: string; content: string }): string {
  return msg.timestamp + msg.content.slice(0, 40);
}

/**
 * Validate a thread loaded from disk. A malformed or hand-edited file must
 * never crash the chat UI; invalid entries are dropped and the storage layer
 * reports the underlying problem.
 */
export function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
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
    messages.push({
      role,
      content,
      timestamp,
      ...(candidate.failed === true ? { failed: true } : {}),
      ...(candidate.purpose === "fit-evaluation"
        ? { purpose: "fit-evaluation" as const }
        : {}),
    });
  }
  return messages;
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
// Debounced thread save (per application)
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingThreadId: string | null = null;
let pendingSnapshot: ChatMessage[] = [];
/**
 * Monotonic token for thread loads. A slow load that finishes after the user
 * switched again must not overwrite the newer thread's messages.
 */
let threadLoadGeneration = 0;

/** Write the current thread to disk, debounced. */
function scheduleThreadSave() {
  const s = useChatStore.getState();
  const threadId = s.activeThreadId;
  if (!threadId) return;
  pendingThreadId = threadId;
  pendingSnapshot = [...s.messages];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const snapshotThreadId = pendingThreadId;
    const snapshot = pendingSnapshot;
    pendingThreadId = null;
    pendingSnapshot = [];
    if (!snapshotThreadId) return;
    await saveJson(`chat_${snapshotThreadId}.json`, snapshot);
  }, 400);
}

function cancelPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingThreadId = null;
  pendingSnapshot = [];
}

/**
 * Flush any pending debounced thread save immediately.
 * Returns false when the write failed; the storage banner reports the reason.
 */
export async function flushChatSave(): Promise<boolean> {
  if (!saveTimer || !pendingThreadId) return true;
  clearTimeout(saveTimer);
  saveTimer = null;
  const threadId = pendingThreadId;
  const snapshot = pendingSnapshot;
  pendingThreadId = null;
  pendingSnapshot = [];
  return saveJson(`chat_${threadId}.json`, snapshot);
}

// ──────────────────────────────────────────────
// Debounced draft save (all threads, one small file)
// ──────────────────────────────────────────────

const DRAFTS_FILE = "drafts.json";
let draftsSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Only non-empty drafts are worth writing to disk. */
function persistableDrafts(
  drafts: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(drafts).filter(
      ([threadId, text]) => threadId.length > 0 && text.length > 0,
    ),
  );
}

function scheduleDraftsSave() {
  if (draftsSaveTimer) clearTimeout(draftsSaveTimer);
  draftsSaveTimer = setTimeout(async () => {
    draftsSaveTimer = null;
    await saveJson(
      DRAFTS_FILE,
      persistableDrafts(useChatStore.getState().drafts),
    );
  }, 500);
}

/** Flush unsent drafts immediately (window close / explicit flush). */
export async function flushDraftsSave(): Promise<boolean> {
  if (draftsSaveTimer) {
    clearTimeout(draftsSaveTimer);
    draftsSaveTimer = null;
  }
  const state = useChatStore.getState();
  // Do not overwrite the stored drafts with an empty object before the
  // startup load has completed. A draft typed during the load still wins.
  if (!state.draftsLoaded && Object.keys(state.drafts).length === 0) {
    return true;
  }
  return saveJson(DRAFTS_FILE, persistableDrafts(state.drafts));
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ChatState {
  /** Chat messages of the active thread */
  messages: ChatMessage[];
  /** Whether config has been loaded from disk */
  configLoaded: boolean;
  /** Whether the API is currently processing a request */
  isSending: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Text of the assistant message currently being generated (live stream). */
  streamingText: string;

  /** Unsent message drafts, keyed by thread (application) id. Kept in
   * memory so switching tabs does not wipe what the user is typing, and
   * persisted to drafts.json so closing the app does not either. */
  drafts: Record<string, string>;
  /** Whether drafts.json has been read for this launch. */
  draftsLoaded: boolean;

  /** API configuration */
  config: ApiConfig;

  /** Application whose chat thread is currently loaded (null = none) */
  activeThreadId: string | null;
  /** Whether the current thread has finished loading from disk */
  threadLoaded: boolean;

  // Message actions
  addMessage: (msg: ChatMessage) => void;
  /** Replace a message by key (e.g. clear a failed flag, swap a regenerated reply). */
  updateMessage: (
    key: string,
    updater: (msg: ChatMessage) => ChatMessage,
  ) => void;
  /**
   * Append a message to a specific thread. If that thread is no longer active
   * (the user switched applications while a refine action was running), the
   * message is appended to that thread's file instead of leaking into the
   * thread currently on screen.
   */
  appendMessageToThread: (threadId: string, msg: ChatMessage) => Promise<void>;
  /** Replace a message in a specific thread, active or not. */
  updateMessageInThread: (
    threadId: string,
    key: string,
    updater: (msg: ChatMessage) => ChatMessage,
  ) => Promise<void>;
  clearMessages: () => Promise<void>;
  /** Load (or reset) the chat thread for an application. `force` reloads even
   * when the same thread is already loaded (used after importing a backup). */
  switchThread: (applicationId: string | null, force?: boolean) => Promise<void>;
  /** Load persisted unsent drafts. `force` replaces in-memory drafts instead
   * of merging over them (used after importing a backup). */
  loadDrafts: (force?: boolean) => Promise<void>;
  /** Remove the draft belonging to a deleted application. */
  discardDraft: (threadId: string) => void;

  // Config actions
  /** Merge the given fields into the stored config and persist the result. */
  setConfig: (cfg: Partial<ApiConfig>) => Promise<void>;
  loadConfig: () => Promise<void>;
  /** Mark config as not yet configured (e.g. user clicks Edit) */
  resetConfig: () => void;

  // Sending state
  setIsSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
  /** Set the live-streamed assistant text (string, or updater for appends). */
  setStreamingText: (
    updater: string | ((prev: string) => string),
  ) => void;
  /** Save the unsent message draft for the current thread. */
  setDraft: (value: string) => void;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  configLoaded: false,
  isSending: false,
  error: null,
  streamingText: "",
  drafts: {},
  draftsLoaded: false,

  config: { ...defaultApiConfig },

  activeThreadId: null,
  threadLoaded: true,

  // ── Messages ──

  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    scheduleThreadSave();
  },

  updateMessage: (key, updater) => {
    set((s) => ({
      messages: s.messages.map((m) => (messageKey(m) === key ? updater(m) : m)),
    }));
    scheduleThreadSave();
  },

  appendMessageToThread: async (threadId, msg) => {
    const current = get();
    if (current.activeThreadId === threadId) {
      set((s) => ({ messages: [...s.messages, msg] }));
      scheduleThreadSave();
      return;
    }
    const data = await loadJson<unknown>(`chat_${threadId}.json`);
    const messages = [...normalizeChatMessages(data), msg];
    await saveJson(`chat_${threadId}.json`, messages);
  },

  updateMessageInThread: async (threadId, key, updater) => {
    const current = get();
    if (current.activeThreadId === threadId) {
      let changed = false;
      const messages = current.messages.map((msg) => {
        if (messageKey(msg) !== key) return msg;
        changed = true;
        return updater(msg);
      });
      if (changed) {
        set({ messages });
        scheduleThreadSave();
      }
      return;
    }
    const data = await loadJson<unknown>(`chat_${threadId}.json`);
    let changed = false;
    const messages = normalizeChatMessages(data).map((msg) => {
      if (messageKey(msg) !== key) return msg;
      changed = true;
      return updater(msg);
    });
    if (changed) {
      await saveJson(`chat_${threadId}.json`, messages);
    }
  },

  clearMessages: async () => {
    const threadId = get().activeThreadId;
    // Invalidate any in-flight load so it cannot repopulate the cleared thread.
    threadLoadGeneration += 1;
    cancelPendingSave();
    set({ messages: [], threadLoaded: true, error: null });
    if (!threadId) return;
    set((s) => {
      const drafts = { ...s.drafts };
      delete drafts[threadId];
      return { drafts };
    });
    scheduleDraftsSave();
    await deleteFile(`chat_${threadId}.json`);
  },

  loadDrafts: async (force = false) => {
    const raw = await loadJson<unknown>(DRAFTS_FILE);
    if (raw == null) {
      // A missing file is normal. On a forced reload (import) it means the
      // restored backup has no drafts, so clear the old ones.
      set((s) => ({
        drafts: force ? {} : s.drafts,
        draftsLoaded: true,
      }));
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
    // A draft typed while the file was loading wins over the stored text.
    set((s) => ({
      drafts: force ? loaded : { ...loaded, ...s.drafts },
      draftsLoaded: true,
    }));
  },

  discardDraft: (threadId) => {
    const current = get().drafts;
    if (!(threadId in current)) return;
    const drafts = { ...current };
    delete drafts[threadId];
    set({ drafts });
    scheduleDraftsSave();
  },

  switchThread: async (applicationId, force = false) => {
    const current = get();
    if (
      !force &&
      current.activeThreadId === applicationId &&
      current.threadLoaded
    ) {
      return;
    }
    const generation = ++threadLoadGeneration;
    // Persist the outgoing thread before its messages are replaced. Without
    // this, a message sent inside the 400 ms debounce window is lost.
    await flushChatSave();
    if (generation !== threadLoadGeneration) return;

    if (!applicationId) {
      set({
        messages: [],
        activeThreadId: null,
        threadLoaded: true,
        streamingText: "",
        error: null,
      });
      return;
    }

    set({
      messages: [],
      threadLoaded: false,
      activeThreadId: applicationId,
      streamingText: "",
      error: null,
    });
    const data = await loadJson<unknown>(`chat_${applicationId}.json`);
    // A newer switch (or a reset) won the race: discard this result.
    if (generation !== threadLoadGeneration) return;
    set({
      messages: normalizeChatMessages(data),
      threadLoaded: true,
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
        await saveJson("config.json", persistableConfig({ ...data, apiKey: "" }));
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
      set({ config: withDefaults({ ...defaultApiConfig }), configLoaded: true });
    }
  },
  resetConfig: () => {
    set({ config: { ...defaultApiConfig }, configLoaded: false });
  },

  // ── Sending state ──

  setIsSending: (sending) => set({ isSending: sending }),
  setError: (error) => set({ error }),
  setStreamingText: (updater) =>
    set((s) => ({
      streamingText:
        typeof updater === "function"
          ? (updater as (prev: string) => string)(s.streamingText)
          : updater,
    })),
  setDraft: (value) => {
    const threadId = get().activeThreadId;
    if (!threadId) return;
    set((s) => ({
      drafts: {
        ...s.drafts,
        [threadId]: value,
      },
    }));
    scheduleDraftsSave();
  },
}));
