import { create } from "zustand";
import type { ApplicationStatus } from "@/types";

export type TabId = "application" | "chat" | "profile";
export type ApplicationViewMode = "active" | "archived";
export type ApplicationSortMode = "status" | "updated" | "company" | "deadline";

/**
 * Small amount of cross-tab UI state. Keeping the application filters here
 * means switching to Chat and back no longer silently resets them, and
 * "New application" can clear them deliberately instead of creating a row the
 * current filter hides.
 */
interface AppState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  applicationFilter: string;
  setApplicationFilter: (filter: string) => void;
  applicationStatusFilter: ApplicationStatus | null;
  setApplicationStatusFilter: (status: ApplicationStatus | null) => void;
  applicationViewMode: ApplicationViewMode;
  setApplicationViewMode: (mode: ApplicationViewMode) => void;
  applicationSortMode: ApplicationSortMode;
  setApplicationSortMode: (mode: ApplicationSortMode) => void;
  resetApplicationFilters: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "application",
  setActiveTab: (tab) => set({ activeTab: tab }),

  applicationFilter: "",
  setApplicationFilter: (filter) => set({ applicationFilter: filter }),
  applicationStatusFilter: null,
  setApplicationStatusFilter: (status) =>
    set({ applicationStatusFilter: status }),
  applicationViewMode: "active",
  setApplicationViewMode: (mode) => set({ applicationViewMode: mode }),
  applicationSortMode: "status",
  setApplicationSortMode: (mode) => set({ applicationSortMode: mode }),
  resetApplicationFilters: () =>
    set({
      applicationFilter: "",
      applicationStatusFilter: null,
      applicationViewMode: "active",
    }),
}));
