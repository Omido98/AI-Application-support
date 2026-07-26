import { create } from "zustand";
import type { Conversation, UserProfile, AppConfig } from "@/types";

interface AppState {
  activeTab: "application" | "chat" | "profile";
  setActiveTab: (tab: "application" | "chat" | "profile") => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  addConversation: (conversation: Conversation) => void;

  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;

  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "application",
  setActiveTab: (tab) => set({ activeTab: tab }),

  conversations: [],
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [...state.conversations, conversation],
    })),

  profile: null,
  setProfile: (profile) => set({ profile }),

  config: {
    theme: "dark",
    defaultModel: "gpt-4",
    maxTokens: 2048,
    temperature: 0.7,
    fontSize: 14,
  },
  updateConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),
}));
