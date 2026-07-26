import { create } from "zustand";
import { saveJson, loadJson } from "@/utils/storage";

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
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingBudget: number | null;
}

const defaultApiConfig: ApiConfig = {
  baseUrl: "https://api.opencode.ai/v1",
  apiKey: "",
  model: "deepseek-v4-flash-free",
  thinkingBudget: null,
};

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ChatState {
  /** Chat messages */
  messages: ChatMessage[];
  /** Whether history has been loaded from disk */
  historyLoaded: boolean;
  /** Whether config has been loaded from disk */
  configLoaded: boolean;
  /** Whether the API is currently processing a request */
  isSending: boolean;
  /** Last error message, if any */
  error: string | null;

  /** API configuration */
  config: ApiConfig;

  // Message actions
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  loadHistory: () => Promise<void>;

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
  historyLoaded: false,
  configLoaded: false,
  isSending: false,
  error: null,

  config: { ...defaultApiConfig },

  // ── Messages ──

  addMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
    // Auto-save history
    const { messages } = get();
    saveJson("chat_history.json", messages);
  },

  clearMessages: () => {
    set({ messages: [] });
    saveJson("chat_history.json", []);
  },

  loadHistory: async () => {
    const data = await loadJson<ChatMessage[]>("chat_history.json");
    if (data) {
      set({ messages: data, historyLoaded: true });
    } else {
      set({ historyLoaded: true });
    }
  },

  // ── Config ──

  setConfig: async (cfg) => {
    set({ config: cfg });
    await saveJson("config.json", cfg);
  },

  loadConfig: async () => {
    const data = await loadJson<ApiConfig>("config.json");
    if (data && data.apiKey) {
      set({ config: data, configLoaded: true });
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
