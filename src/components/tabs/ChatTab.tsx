import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { sendMessage } from "@/utils/api";
import { buildSystemPrompt } from "@/utils/systemPrompt";
import ApiConfig from "@/components/chat/ApiConfig";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import InjectProfileButton from "@/components/chat/InjectProfileButton";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

export default function ChatTab() {
  // ── Stores ──
  const configLoaded = useChatStore((s) => s.configLoaded);
  const config = useChatStore((s) => s.config);
  const loadConfig = useChatStore((s) => s.loadConfig);

  const historyLoaded = useChatStore((s) => s.historyLoaded);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const addMessage = useChatStore((s) => s.addMessage);
  const isSending = useChatStore((s) => s.isSending);
  const setIsSending = useChatStore((s) => s.setIsSending);
  const setError = useChatStore((s) => s.setError);

  const application = useApplicationStore();
  const profile = useProfileStore();

  // ── Input state ──
  const [inputValue, setInputValue] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
    if (!historyLoaded) loadHistory();
  }, [configLoaded, historyLoaded, loadConfig, loadHistory]);

  // ── Handle inject profile ──
  const handleInject = useCallback((json: string) => {
    setInputValue((prev) => (prev ? prev + "\n\n" + json : json));
  }, []);

  // ── Handle send ──
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    // Clear input immediately
    setInputValue("");

    // Add user message
    const userMsg = {
      role: "user" as const,
      content: text,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);

    // Build system prompt
    const appCtx = {
      company: application.companyName,
      jobDescription: application.jobDescription,
      language: application.applicationLanguage,
      requirements: application.requirements,
      companyResearch: application.companyResearch,
    };
    const profileData = {
      education: profile.education,
      coverLetters: profile.coverLetters,
      workExperience: profile.workExperience,
      skills: profile.skills,
      languages: profile.languages,
    };
    const systemPrompt = buildSystemPrompt(appCtx, profileData);

    // Send to API
    setIsSending(true);
    setError(null);

    const { messages } = useChatStore.getState();
    const result = await sendMessage(messages, config, systemPrompt);

    if (result.error) {
      setError(result.error);
      setIsSending(false);
    } else {
      const assistantMsg = {
        role: "assistant" as const,
        content: result.content,
        timestamp: new Date().toISOString(),
      };
      addMessage(assistantMsg);
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    addMessage,
    application,
    profile,
    config,
    setIsSending,
    setError,
  ]);

  // ── Show loading state while restoring ──
  if (!configLoaded || !historyLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading chat…</p>
      </div>
    );
  }

  // ── Show API config if not yet configured, or opened from settings ──
  if (!config.apiKey || showConfig) {
    return <ApiConfig onDone={() => setShowConfig(false)} />;
  }

  // ── Chat interface ──
  return (
    <div className="flex flex-col h-full">
      {/* Header + Inject Profile */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h2 className="text-base font-semibold text-text-primary">Chat</h2>
        <div className="flex items-center gap-2">
          <InjectProfileButton onInject={handleInject} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowConfig(true)}
            title="API settings"
          >
            <Settings className="size-4 text-text-secondary" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <MessageList />

      {/* Input */}
      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        disabled={isSending}
      />
    </div>
  );
}
