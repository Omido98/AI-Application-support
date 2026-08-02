import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useAppStore } from "@/stores/useAppStore";
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

  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const threadLoaded = useChatStore((s) => s.threadLoaded);
  const switchThread = useChatStore((s) => s.switchThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const isSending = useChatStore((s) => s.isSending);
  const setIsSending = useChatStore((s) => s.setIsSending);
  const setError = useChatStore((s) => s.setError);

  const applications = useApplicationStore((s) => s.applications);
  const applicationsLoaded = useApplicationStore((s) => s.isLoaded);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const application =
    applications.find((a) => a.id === selectedId) ?? null;

  const profile = useProfileStore();
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  // ── Input state ──
  const [inputValue, setInputValue] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // ── Load the selected application's thread ──
  useEffect(() => {
    void switchThread(selectedId);
  }, [selectedId, switchThread]);

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
      if (!trimmed || isSending || !application) return;

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
        linkedinUrl: profile.linkedinUrl,
      };
      const systemPrompt = buildSystemPrompt(appCtx, profileData, {
        mode: config.systemPromptMode ?? "standard",
        customPrompt: config.customSystemPrompt ?? "",
      });

      // Send to API
      setIsSending(true);
      setError(null);

      const threadAtSend = useChatStore.getState().activeThreadId;
      const { messages } = useChatStore.getState();
      const result = await sendMessage(messages, config, systemPrompt);

      // Drop the reply if the user switched applications while it was in flight
      if (useChatStore.getState().activeThreadId !== threadAtSend) {
        setIsSending(false);
        return;
      }

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

  // ── Applications still loading ──
  if (!applicationsLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading…</p>
      </div>
    );
  }

  // ── No application to talk about yet ──
  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-text-primary text-lg font-semibold">
          No application yet
        </p>
        <p className="text-text-muted text-sm mt-2 max-w-md">
          The chat assistant works on one application at a time. Create an
          application first, then come back here to craft your cover letter
          and answers.
        </p>
        <Button
          className="bg-primary hover:bg-primary/80 text-primary-foreground mt-6"
          onClick={() => setActiveTab("application")}
        >
          Go to Applications
        </Button>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-text-primary text-lg font-semibold">
          No application selected
        </p>
        <p className="text-text-muted text-sm mt-2 max-w-md">
          Select an application from the list to chat about it.
        </p>
        <Button
          className="bg-primary hover:bg-primary/80 text-primary-foreground mt-6"
          onClick={() => setActiveTab("application")}
        >
          Go to Applications
        </Button>
      </div>
    );
  }

  // ── Show loading state while restoring the thread ──
  if (!threadLoaded && activeThreadId === application.id) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading conversation…</p>
      </div>
    );
  }

  // ── Chat interface ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">
            {application.companyName.trim() || "Untitled application"}
          </h2>
          {application.jobTitle.trim() && (
            <p className="text-xs text-text-muted truncate">
              {application.jobTitle}
            </p>
          )}
        </div>
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
