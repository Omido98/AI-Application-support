import { create } from "zustand";
import { saveJson, loadJson, deleteFile } from "@/utils/storage";
import {
  inferProviderFromBaseUrl,
  isKnownProviderId,
  type ProviderId,
} from "@/utils/providers";

// ──────────────────────────────────────────────
// Chat message type (lighter than the full Message type)
// ──────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ──────────────────────────────────────────────
// API configuration
// ──────────────────────────────────────────────

export interface ApiConfig {
  /** Which LLM provider this config targets (determines endpoint & auth). */
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  /** Which system prompt the chat agent uses. */
  systemPromptMode: "standard" | "custom";
  /** The user's custom prompt, used when systemPromptMode is "custom". */
  customSystemPrompt: string;
}

export const ZEN_DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";

const defaultApiConfig: ApiConfig = {
  provider: "zen",
  baseUrl: ZEN_DEFAULT_BASE_URL,
  apiKey: "",
  model: "deepseek-v4-flash-free",
  reasoningEffort: null,
  systemPromptMode: "standard",
  customSystemPrompt: "",
};

// ──────────────────────────────────────────────
// Debounced thread save (per application)
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingThreadId: string | null = null;
let pendingSnapshot: ChatMessage[] = [];

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
    await saveJson(`chat_${pendingThreadId}.json`, pendingSnapshot);
  }, 400);
}

function cancelPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
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

  /** API configuration */
  config: ApiConfig;

  /** Application whose chat thread is currently loaded (null = none) */
  activeThreadId: string | null;
  /** Whether the current thread has finished loading from disk */
  threadLoaded: boolean;

  // Message actions
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => Promise<void>;
  /** Load (or reset) the chat thread for an application */
  switchThread: (applicationId: string | null) => Promise<void>;

  // Config actions
  setConfig: (cfg: ApiConfig) => Promise<void>;
  loadConfig: () => Promise<void>;
  /** Mark config as not yet configured (e.g. user clicks Edit) */
  resetConfig: () => void;

  // Sending state
  setIsSending: (sending: boolean) => void;
  setError: (error: string | null) => void;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  configLoaded: false,
  isSending: false,
  error: null,

  config: { ...defaultApiConfig },

  activeThreadId: null,
  threadLoaded: true,

  // ── Messages ──

  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    scheduleThreadSave();
  },

  clearMessages: async () => {
    cancelPendingSave();
    set({ messages: [] });
    const threadId = get().activeThreadId;
    if (threadId) {
      await deleteFile(`chat_${threadId}.json`);
    }
  },

  switchThread: async (applicationId) => {
    const current = get();
    if (current.activeThreadId === applicationId && current.threadLoaded) {
      return;
    }
    cancelPendingSave();
    if (!applicationId) {
      set({ messages: [], activeThreadId: null, threadLoaded: true });
      return;
    }
    set({ threadLoaded: false, activeThreadId: applicationId });
    const data = await loadJson<ChatMessage[]>(`chat_${applicationId}.json`);
    set({ messages: data ?? [], threadLoaded: true });
  },

  // ── Config ──

  setConfig: async (cfg) => {
    set({ config: cfg });
    await saveJson("config.json", cfg);
  },

  loadConfig: async () => {
    const data = await loadJson<ApiConfig>("config.json");
    if (data && data.apiKey) {
      // Migrate the old, non-existent endpoint to the real OpenCode Zen URL
      if (
        data.baseUrl &&
        data.baseUrl.includes("api.opencode.ai") &&
        !data.baseUrl.includes("opencode.ai/zen")
      ) {
        data.baseUrl = ZEN_DEFAULT_BASE_URL;
      }
      // Infer the provider from the stored base URL when it's missing
      if (!isKnownProviderId(data.provider)) {
        data.provider = inferProviderFromBaseUrl(data.baseUrl);
      }
      set({
        config: {
          ...data,
          reasoningEffort: data.reasoningEffort ?? null,
          systemPromptMode: data.systemPromptMode ?? "standard",
          customSystemPrompt: data.customSystemPrompt ?? "",
        },
        configLoaded: true,
      });
    } else {
      set({ config: { ...defaultApiConfig }, configLoaded: true });
    }
  },
  resetConfig: () => {
    set({ config: { ...defaultApiConfig }, configLoaded: false });
  },

  // ── Sending state ──

  setIsSending: (sending) => set({ isSending: sending }),
  setError: (error) => set({ error }),
}));
