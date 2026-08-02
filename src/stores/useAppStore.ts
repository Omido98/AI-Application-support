import { create } from "zustand";

export type TabId = "application" | "chat" | "profile";

interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "application",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
