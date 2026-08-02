import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/stores/useAppStore";
import {
  useSettingsStore,
  getAccentForeground,
} from "@/stores/settingsStore";
import { flushApplicationSave } from "@/stores/applicationStore";
import { flushProfileSave } from "@/stores/profileStore";
import { flushChatSave } from "@/stores/chatStore";
import ApplicationTab from "@/components/tabs/ApplicationTab";
import ChatTab from "@/components/tabs/ChatTab";
import ProfileTab from "@/components/tabs/ProfileTab";
import SettingsDialog from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";

type TabId = "application" | "chat" | "profile";

const tabs: { id: TabId; label: string }[] = [
  { id: "application", label: "Application" },
  { id: "chat", label: "Chat" },
  { id: "profile", label: "Profile" },
];

function flushPendingSaves() {
  void flushApplicationSave();
  void flushProfileSave();
  void flushChatSave();
}

function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);

  const [showSettings, setShowSettings] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  // Flush debounced saves when the window closes, so the last edit is never lost
  useEffect(() => {
    window.addEventListener("beforeunload", flushPendingSaves);

    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          event.preventDefault();
          await Promise.all([
            flushApplicationSave(),
            flushProfileSave(),
            flushChatSave(),
          ]);
          await win.destroy();
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

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

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
      case "application":
        return <ApplicationTab />;
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return null;
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === activeTab);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(idx + dir + tabs.length) % tabs.length];
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
      {/* Tab Bar */}
      <header className="relative flex items-center justify-center px-6 py-4 border-b border-border">
        <nav className="flex gap-2" role="tablist" onKeyDown={handleTabKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="tabpanel-main"
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 select-none
                ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "bg-surface text-text-secondary hover:bg-border hover:text-text-primary hover:brightness-110"
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
      <main className="flex-1 overflow-auto" role="tabpanel" id="tabpanel-main">
        {renderTab()}
      </main>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}

export default App;
