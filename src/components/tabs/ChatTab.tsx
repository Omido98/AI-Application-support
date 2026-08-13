import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useAppStore } from "@/stores/useAppStore";
import { sendMessage } from "@/utils/api";
import { buildSystemPrompt } from "@/utils/systemPrompt";
import ChatSettings from "@/components/chat/ChatSettings";
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

interface ChatTabProps {
  /** Opens the general Settings dialog (used to configure the API). */
  onOpenSettings: () => void;
}

export default function ChatTab({ onOpenSettings }: ChatTabProps) {
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
  const setStreamingText = useChatStore((s) => s.setStreamingText);
  const inputValue = useChatStore(
    (s) => s.drafts[s.activeThreadId ?? ""] ?? "",
  );
  const setDraft = useChatStore((s) => s.setDraft);

  const applications = useApplicationStore((s) => s.applications);
  const applicationsLoaded = useApplicationStore((s) => s.isLoaded);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const application =
    applications.find((a) => a.id === selectedId) ?? null;

  const profile = useProfileStore();
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  // ── Input state ──
  const [showConfig, setShowConfig] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Aborts the in-flight generation (used by the Stop button / Escape).
  const controllerRef = useRef<AbortController | null>(null);

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // ── Load the selected application's thread ──
  useEffect(() => {
    // Abort any generation still in flight for the previous thread.
    controllerRef.current?.abort();
    controllerRef.current = null;
    void switchThread(selectedId);
  }, [selectedId, switchThread]);

  // ── Stop generation (Stop button / Escape key) ──
  const handleStop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSending) {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSending, handleStop]);

  // ── Handle reset chat ──
  const handleReset = useCallback(() => {
    clearMessages();
    setError(null);
    setDraft("");
    setConfirmReset(false);
  }, [clearMessages, setError, setDraft]);

  // ── Send a given text as a user message ──
  // `triggerFitEvaluation` is set by the starter button only, so the agent
  // runs the fit evaluation exactly when the user asks for it via the button.
  const sendText = useCallback(
    async (text: string, triggerFitEvaluation = false) => {
      const trimmed = text.trim();
      if (!trimmed || isSending || !application) return;

      // Clear input immediately
      setDraft("");

      // Add user message
      const userMsg = {
        role: "user" as const,
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);

      // Send to API
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreamingText("");
      setIsSending(true);
      setError(null);

      // Application context of the current thread
      const appCtx = {
        company: application.companyName,
        jobDescription: application.jobDescription,
        language: application.applicationLanguage,
        requirements: application.requirements,
        companyResearch: application.companyResearch,
      };

      // Make sure the profile has been loaded from disk before it is sent.
      // App startup loads it too; this covers sends racing that load.
      if (!profile.isLoaded) {
        await loadProfile();
      }
      const freshProfile = useProfileStore.getState();
      const profileData = {
        fullName: freshProfile.fullName,
        email: freshProfile.email,
        city: freshProfile.city,
        country: freshProfile.country,
        linkedinUrl: freshProfile.linkedinUrl,
        bio: freshProfile.bio,
        coverLetterSummary: freshProfile.coverLetterSummary,
        interests: freshProfile.interests,
        education: freshProfile.education,
        coverLetters: freshProfile.coverLetters,
        workExperience: freshProfile.workExperience,
        otherEngagements: freshProfile.otherEngagements,
        certifications: freshProfile.certifications,
        skills: freshProfile.skills,
        languages: freshProfile.languages,
      };

      const systemPrompt = buildSystemPrompt(appCtx, profileData, {
        mode: config.systemPromptMode ?? "standard",
        customPrompt: config.customSystemPrompt ?? "",
        fitEvaluation: triggerFitEvaluation,
      });

      const threadAtSend = useChatStore.getState().activeThreadId;
      const { messages } = useChatStore.getState();
      const result = await sendMessage(messages, config, systemPrompt, {
        signal: controller.signal,
        onDelta: (chunk) => {
          // Only render text while still in the thread it was sent from.
          if (useChatStore.getState().activeThreadId === threadAtSend) {
            setStreamingText((prev) => prev + chunk);
          }
        },
      });

      // Drop the reply if the user switched applications while it was in flight
      if (useChatStore.getState().activeThreadId !== threadAtSend) {
        setIsSending(false);
        setStreamingText("");
        controllerRef.current = null;
        return;
      }

      if (result.error) {
        setError(result.error);
        setIsSending(false);
        setStreamingText("");
      } else if (result.stopped) {
        // User stopped mid-answer: keep whatever was generated so far.
        const partial = useChatStore.getState().streamingText;
        if (partial.trim()) {
          addMessage({
            role: "assistant",
            content: partial,
            timestamp: new Date().toISOString(),
          });
        }
        setStreamingText("");
        setIsSending(false);
      } else {
        addMessage({
          role: "assistant",
          content: result.content,
          timestamp: new Date().toISOString(),
        });
        setStreamingText("");
        setIsSending(false);
      }
      controllerRef.current = null;
    },
    [
      isSending,
      addMessage,
      application,
      profile,
      loadProfile,
      config,
      setIsSending,
      setError,
      setStreamingText,
      setDraft,
    ],
  );

  // ── Handle send ──
  const handleSend = useCallback(() => {
    void sendText(inputValue);
  }, [inputValue, sendText]);

  // ── Starter button on empty chat ──
  const handleStart = useCallback(() => {
    void sendText("Help me answer my application", true);
  }, [sendText]);

  // ── Show loading state while restoring config ──
  if (!configLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading chat…</p>
      </div>
    );
  }

  // ── Show chat agent settings (web search + prompt) when explicitly opened ──
  if (showConfig) {
    return (
      <ChatSettings
        onDone={() => setShowConfig(false)}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  // ── No API key yet: explain and offer to configure ──
  if (!config.apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-text-primary text-lg font-semibold">
          Connect your AI provider
        </p>
        <p className="text-text-muted text-sm mt-2 max-w-md">
          The chat assistant needs an API key to work. You can use OpenCode
          Zen, Anthropic, OpenAI, or any OpenAI-compatible endpoint. Your key
          is stored securely in your system&apos;s keychain and never leaves
          your computer.
        </p>
        <Button
          className="bg-primary hover:bg-primary/80 text-primary-foreground mt-6"
          onClick={onOpenSettings}
        >
          <Settings className="size-4 mr-1.5" />
          Configure API
        </Button>
      </div>
    );
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
                  aria-label="Reset chat"
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
                title="Chat agent settings"
                aria-label="Chat agent settings"
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
        onChange={setDraft}
        onSend={handleSend}
        onStop={handleStop}
        disabled={isSending}
      />
    </div>
  );
}
