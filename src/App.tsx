import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/useAppStore";
import {
  useSettingsStore,
  getAccentForeground,
} from "@/stores/settingsStore";
import { useProfileStore } from "@/stores/profileStore";
import { useChatStore } from "@/stores/chatStore";
import { flushAllSaves } from "@/utils/flushSaves";
import OverviewTab from "@/components/tabs/OverviewTab";
import ApplicationTab from "@/components/tabs/ApplicationTab";
import ChatTab from "@/components/tabs/ChatTab";
import ProfileTab from "@/components/tabs/ProfileTab";
import SettingsDialog from "@/components/settings/SettingsDialog";
import OnboardingDialog from "@/components/OnboardingDialog";
import StorageAlert from "@/components/StorageAlert";
import { Button } from "@/components/ui/button";

type TabId = "overview" | "application" | "chat" | "profile";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "application", label: "Application" },
  { id: "chat", label: "Cover Letter Developer" },
  { id: "profile", label: "Profile" },
];

function flushPendingSaves() {
  void flushAllSaves();
}

function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const lastTab = useSettingsStore((s) => s.lastTab);
  const setLastTab = useSettingsStore((s) => s.setLastTab);
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);
  const setOnboardingDone = useSettingsStore((s) => s.setOnboardingDone);

  const [showSettings, setShowSettings] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  // Load the persisted profile on mount, so the chat agent always sees it
  // even if the user never visits the Profile tab.
  useEffect(() => {
    void useProfileStore.getState().loadProfile();
  }, []);

  // Restore unsent chat drafts from the previous session.
  const draftsLoaded = useChatStore((s) => s.draftsLoaded);
  const loadDrafts = useChatStore((s) => s.loadDrafts);
  useEffect(() => {
    if (!draftsLoaded) void loadDrafts();
  }, [draftsLoaded, loadDrafts]);

  // Flush debounced saves when the window closes, so the last edit is never lost
  useEffect(() => {
    window.addEventListener("beforeunload", flushPendingSaves);

    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const win = getCurrentWindow();
        let closing = false;
        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          if (closing) return;
          closing = true;
          // Never strand the user with unsaved work silently: if a write
          // fails, ask before closing anyway.
          const saved = await flushAllSaves();
          if (!saved) {
            let closeAnyway = false;
            try {
              closeAnyway = await ask(
                "Some changes could not be saved to disk. Close the app anyway and lose them?",
                { title: "Save failed", kind: "warning" },
              );
            } catch {
              closeAnyway = false;
            }
            if (!closeAnyway) {
              closing = false;
              return;
            }
          }
          try {
            await win.destroy();
          } catch {
            // destroy can fail (e.g. denied permission); never strand the user
            await exit(0);
          }
        });
      } catch {
        // Not running inside Tauri (e.g. browser dev) — beforeunload covers it.
      }
    })();

    return () => {
      window.removeEventListener("beforeunload", flushPendingSaves);
      unlisten?.();
    };
  }, []);

  // Apply theme. The "system" preference follows the OS setting live.
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDark(event.matches);
    setSystemPrefersDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const isDarkTheme =
    theme === "system" ? systemPrefersDark : theme === "dark";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkTheme);
  }, [isDarkTheme]);

  // Restore the tab from the previous session once, then keep settings.json
  // in sync whenever the user switches sections.
  const [restoredTab, setRestoredTab] = useState(false);
  useEffect(() => {
    if (!settingsLoaded || restoredTab) return;
    setRestoredTab(true);
    if (lastTab !== activeTab) setActiveTab(lastTab);
  }, [settingsLoaded, restoredTab, lastTab, activeTab, setActiveTab]);

  useEffect(() => {
    if (!restoredTab) return;
    if (activeTab !== lastTab) setLastTab(activeTab);
  }, [restoredTab, activeTab, lastTab, setLastTab]);

  // Keyboard shortcuts: Ctrl/Cmd+1..4 switch sections, Ctrl/Cmd+, opens Settings.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key === ",") {
        event.preventDefault();
        setShowSettings(true);
        return;
      }
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0) {
        event.preventDefault();
        setActiveTab(tabs[index].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveTab]);

  // Apply accent colour (+ readable foreground)
  useEffect(() => {
    const root = document.documentElement;
    const fg = getAccentForeground(accent);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-foreground", fg);
    root.style.setProperty("--chart-1", accent);
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--sidebar-primary-foreground", fg);
    root.style.setProperty("--sidebar-ring", accent);
  }, [accent]);

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />;
      case "application":
        return <ApplicationTab />;
      case "chat":
        return <ChatTab onOpenSettings={() => setShowSettings(true)} />;
      case "profile":
        return <ProfileTab />;
      default:
        return null;
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeTab);
    let next;
    if (key === "Home") {
      next = tabs[0];
    } else if (key === "End") {
      next = tabs[tabs.length - 1];
    } else {
      const dir = key === "ArrowRight" ? 1 : -1;
      next = tabs[(idx + dir + tabs.length) % tabs.length];
    }
    setActiveTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  // Keep the app blank until settings are loaded, so the theme is applied
  // before any content paints (prevents a light/dark flash on cold start).
  if (!settingsLoaded) {
    return <div className="h-screen w-screen bg-background" />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <a
        href="#tabpanel-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Tab Bar */}
      <header className="relative flex items-center justify-center px-6 py-4 border-b border-border">
        <nav
          className="flex gap-2"
          role="tablist"
          aria-label="Main sections"
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="tabpanel-main"
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-6 py-2 rounded-full text-sm font-medium transition-colors duration-200 select-none
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-text-secondary hover:bg-border hover:text-text-primary"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <div className="absolute right-6">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="size-4 text-text-secondary" />
          </Button>
        </div>
      </header>

      {/* Content Area */}
      <StorageAlert />
      <main
        className="flex-1 overflow-auto"
        role="tabpanel"
        id="tabpanel-main"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={-1}
      >
        {renderTab()}
      </main>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <OnboardingDialog
        open={!onboardingDone}
        onDone={() => setOnboardingDone(true)}
      />
    </div>
  );
}

export default App;
