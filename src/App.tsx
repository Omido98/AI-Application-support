import { useAppStore } from "@/stores/useAppStore";
import ApplicationTab from "@/components/tabs/ApplicationTab";
import ChatTab from "@/components/tabs/ChatTab";
import ProfileTab from "@/components/tabs/ProfileTab";

type TabId = "application" | "chat" | "profile";

const tabs: { id: TabId; label: string }[] = [
  { id: "application", label: "Application" },
  { id: "chat", label: "Chat" },
  { id: "profile", label: "Profile" },
];

function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

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

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      {/* Tab Bar */}
      <header className="flex items-center justify-center gap-2 px-6 py-4 border-b border-border">
        <nav className="flex gap-2" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
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
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-auto" role="tabpanel">
        {renderTab()}
      </main>
    </div>
  );
}

export default App;
