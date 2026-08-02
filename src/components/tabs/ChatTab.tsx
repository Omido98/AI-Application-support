import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { sendMessage } from "@/utils/api";
import { buildSystemPrompt } from "@/utils/systemPrompt";
import ApiConfig from "@/components/chat/ApiConfig";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Trash2 } from "lucide-react";

export default function ChatTab() {
  // ── Stores ──
  const configLoaded = useChatStore((s) => s.configLoaded);
  const config = useChatStore((s) => s.config);
  const loadConfig = useChatStore((s) => s.loadConfig);

  const addMessage = useChatStore((s) => s.addMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const isSending = useChatStore((s) => s.isSending);
  const setIsSending = useChatStore((s) => s.setIsSending);
  const setError = useChatStore((s) => s.setError);

  const application = useApplicationStore();
  const profile = useProfileStore();

  // ── Input state ──
  const [inputValue, setInputValue] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // ── Handle reset chat ──
  const handleReset = useCallback(() => {
    clearMessages();
    setError(null);
    setInputValue("");
    setConfirmReset(false);
  }, [clearMessages, setError]);

  // ── Send a given text as a user message ──
  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      // Clear input immediately
      setInputValue("");

      // Add user message
      const userMsg = {
        role: "user" as const,
        content: trimmed,
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
        certifications: profile.certifications,
        skills: profile.skills,
        languages: profile.languages,
      };
      const systemPrompt = buildSystemPrompt(appCtx, profileData, {
        mode: config.systemPromptMode ?? "standard",
        customPrompt: config.customSystemPrompt ?? "",
      });

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
    },
    [
      isSending,
      addMessage,
      application,
      profile,
      config,
      setIsSending,
      setError,
    ],
  );

  // ── Handle send ──
  const handleSend = useCallback(() => {
    void sendText(inputValue);
  }, [inputValue, sendText]);

  // ── Starter button on empty chat ──
  const handleStart = useCallback(() => {
    void sendText("Help me answer my application");
  }, [sendText]);

  // ── Show loading state while restoring config ──
  if (!configLoaded) {
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h2 className="text-base font-semibold text-text-primary">Chat</h2>
        <div className="flex items-center gap-2">
          <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Reset chat"
                  disabled={isSending}
                >
                  <Trash2 className="size-4 text-text-secondary" />
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset chat?</DialogTitle>
                <DialogDescription>
                  This will delete the current conversation and start fresh. It
                  cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleReset}>
                  Reset Chat
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
      <MessageList onStart={handleStart} />

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
