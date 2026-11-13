import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isConversationMessage,
  messageKey,
  useChatStore,
  type ChatMessage,
} from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useAppStore } from "@/stores/useAppStore";
import { sendMessage, type ToolActivity } from "@/utils/api";
import {
  applicationContextFrom,
  buildConversationSummaryPrompt,
  buildSystemPrompt,
} from "@/utils/systemPrompt";
import { estimateTokens } from "@/utils/tokens";
import { fitHistoryToBudget, getContextBudget } from "@/utils/contextBudget";
import { estimateUsageCost, isFreeModel } from "@/utils/zenPricing";
import { createStreamBatcher } from "@/utils/streamBuffer";
import type { WebSource } from "@/types";
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
  const setConfig = useChatStore((s) => s.setConfig);

  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const threadLoaded = useChatStore((s) => s.threadLoaded);
  const switchThread = useChatStore((s) => s.switchThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendMessageToThread = useChatStore((s) => s.appendMessageToThread);
  const updateMessageInThread = useChatStore((s) => s.updateMessageInThread);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const isSending = useChatStore((s) => s.isSending);
  const setIsSending = useChatStore((s) => s.setIsSending);
  const setError = useChatStore((s) => s.setError);
  const setStreamingText = useChatStore((s) => s.setStreamingText);
  const inputValue = useChatStore(
    (s) => s.drafts[s.activeThreadId ?? ""] ?? "",
  );
  const setDraft = useChatStore((s) => s.setDraft);
  const messages = useChatStore((s) => s.messages);

  const applications = useApplicationStore((s) => s.applications);
  const applicationsLoaded = useApplicationStore((s) => s.isLoaded);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const application = applications.find((a) => a.id === selectedId) ?? null;

  const profile = useProfileStore();
  const loadProfile = useProfileStore((s) => s.loadProfile);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  // Review cards and pending suggestions are UI artifacts, not conversation.
  const conversationMessages = useMemo(
    () => messages.filter(isConversationMessage),
    [messages],
  );

  const summaryMessage = useMemo(
    () => messages.find((message) => message.kind === "summary") ?? null,
    [messages],
  );
  const summaryText = summaryMessage?.content.trim() ?? "";

  // Live estimate of what the next request will actually send, after history
  // trimming, plus how many older messages are omitted to stay in budget.
  const contextBudget = useMemo(
    () => getContextBudget(config.contextWindow),
    [config.contextWindow],
  );
  const contextUsage = useMemo(() => {
    if (!application) {
      return { tokens: 0, dropped: 0 };
    }
    const appCtx = applicationContextFrom(application);
    const basePrompt = buildSystemPrompt(appCtx, profile, {
      mode: config.systemPromptMode ?? "standard",
      customPrompt: config.customSystemPrompt ?? "",
    });
    const baseReserved =
      estimateTokens(basePrompt) + estimateTokens(inputValue);
    const baseFitted = fitHistoryToBudget(conversationMessages, {
      inputBudget: contextBudget.inputBudget,
      reservedTokens: baseReserved,
    });
    // The summary only earns its tokens when something is actually omitted.
    const summary = baseFitted.droppedCount > 0 ? summaryText : "";
    const prompt = summary
      ? buildSystemPrompt(appCtx, profile, {
          mode: config.systemPromptMode ?? "standard",
          customPrompt: config.customSystemPrompt ?? "",
          conversationSummary: summary,
        })
      : basePrompt;
    const reserved = estimateTokens(prompt) + estimateTokens(inputValue);
    const fitted =
      summary || reserved !== baseReserved
        ? fitHistoryToBudget(conversationMessages, {
            inputBudget: contextBudget.inputBudget,
            reservedTokens: reserved,
          })
        : baseFitted;
    return {
      tokens: reserved + fitted.historyTokens,
      dropped: fitted.droppedCount,
    };
  }, [
    application,
    profile,
    conversationMessages,
    inputValue,
    summaryText,
    config.systemPromptMode,
    config.customSystemPrompt,
    contextBudget.inputBudget,
  ]);
  const tokenEstimate = contextUsage.tokens;

  // ── Input state ──
  const [showConfig, setShowConfig] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [replyNotice, setReplyNotice] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const sourcesRef = useRef<WebSource[]>([]);

  // Aborts the in-flight generation (used by the Stop button / Escape).
  const controllerRef = useRef<AbortController | null>(null);

  // Streamed deltas are coalesced into at most one state update per frame.
  const streamBatcher = useMemo(
    () =>
      createStreamBatcher(
        (text) => setStreamingText((previous) => previous + text),
        (callback) => requestAnimationFrame(callback),
        (handle) => cancelAnimationFrame(handle),
      ),
    [setStreamingText],
  );

  const cancelStreamBuffer = useCallback(
    () => streamBatcher.cancel(),
    [streamBatcher],
  );

  const flushStreamBuffer = useCallback(
    () => streamBatcher.flush(),
    [streamBatcher],
  );

  const queueStreamDelta = useCallback(
    (chunk: string) => streamBatcher.push(chunk),
    [streamBatcher],
  );

  useEffect(() => {
    return () => streamBatcher.cancel();
  }, [streamBatcher]);

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // ── Load the selected application's thread ──
  useEffect(() => {
    // Abort any generation still in flight for the previous thread.
    controllerRef.current?.abort();
    controllerRef.current = null;
    cancelStreamBuffer();
    setReplyNotice(null);
    setToolActivity(null);
    setSummaryError(null);
    sourcesRef.current = [];
    void switchThread(selectedId);
  }, [selectedId, switchThread, cancelStreamBuffer]);

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
    setReplyNotice(null);
    setToolActivity(null);
    setSummaryError(null);
    sourcesRef.current = [];
    // A fresh thread means web search should behave like a first message
    // again: enabled for the next message, off afterwards by default.
    void setConfig({ webSearchEnabled: false });
    setConfirmReset(false);
  }, [clearMessages, setError, setDraft, setConfig]);

  const handleSummarizeHistory = useCallback(async () => {
    if (summarizing || isSending || !application) return;
    const threadId = useChatStore.getState().activeThreadId;
    if (!threadId) return;

    const conversation = useChatStore
      .getState()
      .messages.filter(isConversationMessage);
    const appCtx = applicationContextFrom(application);
    const basePrompt = buildSystemPrompt(appCtx, profile, {
      mode: config.systemPromptMode ?? "standard",
      customPrompt: config.customSystemPrompt ?? "",
    });
    const budget = getContextBudget(config.contextWindow);
    const fitted = fitHistoryToBudget(conversation, {
      inputBudget: budget.inputBudget,
      reservedTokens: estimateTokens(basePrompt) + estimateTokens(inputValue),
    });
    if (fitted.droppedCount === 0) {
      setSummaryError(
        "No older messages are being omitted yet; there is nothing to summarize.",
      );
      return;
    }

    // Keep the summarizer request itself bounded for very long threads.
    const dropped = conversation.slice(0, fitted.droppedCount);
    const capped = fitHistoryToBudget(dropped, {
      inputBudget: Math.min(budget.inputBudget, 40_000),
    });
    const lastDropped = capped.messages[capped.messages.length - 1];
    if (!lastDropped) return;

    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await sendMessage(
        [
          {
            role: "user",
            content: "Summarize the earlier conversation.",
            timestamp: new Date().toISOString(),
          },
        ],
        { ...config, webSearchEnabled: false },
        buildConversationSummaryPrompt(capped.messages),
      );
      if (result.error) {
        setSummaryError(result.error);
        return;
      }
      if (result.stopped || !result.content.trim()) return;

      const existingSummary = useChatStore
        .getState()
        .messages.find((message) => message.kind === "summary");
      if (existingSummary) {
        await updateMessageInThread(
          threadId,
          messageKey(existingSummary),
          (message) => ({
            ...message,
            content: result.content,
            sourceKey: messageKey(lastDropped),
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        await appendMessageToThread(threadId, {
          role: "assistant",
          content: result.content,
          timestamp: new Date().toISOString(),
          kind: "summary",
          sourceKey: messageKey(lastDropped),
        });
      }
    } catch (err) {
      setSummaryError(
        err instanceof Error
          ? err.message
          : "Could not summarize the earlier conversation.",
      );
    } finally {
      setSummarizing(false);
    }
  }, [
    application,
    appendMessageToThread,
    config,
    inputValue,
    isSending,
    profile,
    summarizing,
    updateMessageInThread,
  ]);

  // ── Send a message to the chat ──
  // Three modes:
  // - default: `text` is added as a new user message and sent.
  // - `resendKey`: an existing failed user message is sent again in place
  //   (no duplicate is created; the failed marker is cleared on the way out).
  // - `regenerateKey`: the given assistant message is dropped from the
  //   request history and generated anew; on success it is replaced in
  //   place, and on failure the old reply is kept.
  // `triggerFitEvaluation` is set by the starter button only, so the agent
  // runs the fit evaluation exactly when the user asks for it via the button.
  const sendText = useCallback(
    async (
      opts: {
        text?: string;
        triggerFitEvaluation?: boolean;
        resendKey?: string;
        regenerateKey?: string;
      } = {},
    ) => {
      const isResend = !!opts.resendKey;
      const isRegenerate = !!opts.regenerateKey;

      // Read the live flag, not the render-closure value: two fast Enter
      // presses must not start two overlapping generations.
      if (useChatStore.getState().isSending || !application) return;

      const threadAtStart = useChatStore.getState().activeThreadId;
      if (!threadAtStart) return;
      const messagesBefore = useChatStore
        .getState()
        .messages.filter(isConversationMessage);

      let targetIndex = -1;
      let target: ChatMessage | null = null;
      let trimmed: string;
      if (isResend || isRegenerate) {
        const lookupKey = opts.resendKey ?? opts.regenerateKey;
        targetIndex = messagesBefore.findIndex(
          (m) => messageKey(m) === lookupKey,
        );
        target = messagesBefore[targetIndex] ?? null;
        if (!target || !target.content.trim()) return;
        trimmed = target.content.trim();
      } else {
        trimmed = (opts.text ?? "").trim();
      }
      if (!trimmed) return;

      // The starter intent lives on the first user message, so a failed first
      // send (or a regeneration of the first answer) still gets the fit
      // evaluation prompt and its forced company research.
      const isFitEvaluation =
        opts.triggerFitEvaluation === true ||
        target?.purpose === "fit-evaluation" ||
        (isRegenerate &&
          targetIndex > 0 &&
          messagesBefore[targetIndex - 1]?.purpose === "fit-evaluation");

      // Clear the input only for a freshly typed send; re-sends and
      // regenerations reuse a message that is already in the thread.
      if (!isResend && !isRegenerate) {
        setDraft("");
      }

      // Web search runs on the first message of a thread (company research
      // for the fit evaluation); later messages only search when the user
      // enabled it in the chat settings.
      const noAssistantReply = !messagesBefore.some(
        (m) => m.role === "assistant",
      );
      const webSearchEnabled =
        isFitEvaluation || noAssistantReply || config.webSearchEnabled;

      // A re-send clears the failed marker immediately so the button
      // disappears while the request is in flight.
      if (isResend) {
        updateMessage(opts.resendKey!, (m) => ({ ...m, failed: false }));
      }

      // Add the user message only for a fresh send; re-sends reuse the
      // message already in the thread, regenerations keep the old reply
      // until the new one is ready.
      let userMsg: ChatMessage | null = null;
      if (!isResend && !isRegenerate) {
        userMsg = {
          role: "user",
          content: trimmed,
          timestamp: new Date().toISOString(),
          ...(isFitEvaluation ? { purpose: "fit-evaluation" as const } : {}),
        };
        addMessage(userMsg);
      }

      // Send to API. The controller exists before any await so a thread
      // switch can still abort this request.
      const controller = new AbortController();
      controllerRef.current = controller;
      cancelStreamBuffer();
      setStreamingText("");
      setIsSending(true);
      setError(null);
      setReplyNotice(null);
      setToolActivity(null);
      sourcesRef.current = [];

      // Application context of the current thread
      const appCtx = applicationContextFrom(application);

      // Make sure the profile has been loaded from disk before it is sent.
      // App startup loads it too; this covers sends racing that load.
      if (!profile.isLoaded) {
        await loadProfile();
      }
      // The user switched threads (or stopped) while the profile was loading:
      // do not send this request with the old application's context.
      if (
        controller.signal.aborted ||
        useChatStore.getState().activeThreadId !== threadAtStart
      ) {
        setIsSending(false);
        setStreamingText("");
        controllerRef.current = null;
        return;
      }
      const freshProfile = useProfileStore.getState();
      const profileData = {
        fullName: freshProfile.fullName,
        email: freshProfile.email,
        city: freshProfile.city,
        country: freshProfile.country,
        linkedinUrl: freshProfile.linkedinUrl,
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

      const baseSystemPrompt = buildSystemPrompt(appCtx, profileData, {
        mode: config.systemPromptMode ?? "standard",
        customPrompt: config.customSystemPrompt ?? "",
        fitEvaluation: isFitEvaluation,
      });

      const threadAtSend = threadAtStart;
      const conversation = useChatStore
        .getState()
        .messages.filter(isConversationMessage);
      // A regeneration drops the old reply from the history so the model
      // answers afresh; the stored message itself stays until replaced.
      const history = isRegenerate
        ? conversation.filter((m) => messageKey(m) !== opts.regenerateKey)
        : conversation;
      const budget = getContextBudget(config.contextWindow);
      const baseFitted = fitHistoryToBudget(history, {
        inputBudget: budget.inputBudget,
        reservedTokens: estimateTokens(baseSystemPrompt),
      });
      const summaryAtSend =
        baseFitted.droppedCount > 0
          ? (useChatStore
              .getState()
              .messages.find((message) => message.kind === "summary")
              ?.content.trim() ?? "")
          : "";
      const systemPrompt = summaryAtSend
        ? buildSystemPrompt(appCtx, profileData, {
            mode: config.systemPromptMode ?? "standard",
            customPrompt: config.customSystemPrompt ?? "",
            fitEvaluation: isFitEvaluation,
            conversationSummary: summaryAtSend,
          })
        : baseSystemPrompt;
      const fitted = summaryAtSend
        ? fitHistoryToBudget(history, {
            inputBudget: budget.inputBudget,
            reservedTokens: estimateTokens(systemPrompt),
          })
        : baseFitted;
      let sendHistory = fitted.messages;
      // A re-send targets a message that may be older than the trimmed
      // window; make sure the retried prompt is actually part of the request.
      if (
        isResend &&
        target &&
        !sendHistory.some((m) => messageKey(m) === opts.resendKey)
      ) {
        sendHistory = [...sendHistory, target];
      }
      const result = await sendMessage(
        sendHistory,
        { ...config, webSearchEnabled },
        systemPrompt,
        {
          signal: controller.signal,
          onDelta: (chunk) => {
            // Only buffer text while still in the thread it was sent from.
            if (useChatStore.getState().activeThreadId === threadAtSend) {
              setToolActivity((current) => (current ? null : current));
              queueStreamDelta(chunk);
            }
          },
          onToolActivity: (activity) => {
            if (useChatStore.getState().activeThreadId === threadAtSend) {
              setToolActivity(activity);
            }
          },
          onSource: (source) => {
            if (useChatStore.getState().activeThreadId !== threadAtSend) return;
            if (sourcesRef.current.some((entry) => entry.url === source.url)) {
              return;
            }
            sourcesRef.current.push(source);
          },
        },
      );

      // Drop the reply if the user switched applications while it was in flight
      if (useChatStore.getState().activeThreadId !== threadAtSend) {
        cancelStreamBuffer();
        setIsSending(false);
        setStreamingText("");
        controllerRef.current = null;
        return;
      }
      // Make sure the final buffered chunk reaches the store before the
      // stopped-partial path reads it.
      flushStreamBuffer();
      setToolActivity(null);
      const sources =
        sourcesRef.current.length > 0 ? sourcesRef.current : undefined;
      const usage = result.usage;
      const costUsd =
        usage && config.provider === "zen"
          ? isFreeModel(config.model)
            ? 0
            : (estimateUsageCost(config.model, usage) ?? undefined)
          : undefined;

      if (result.error) {
        // The user's message did not land: flag it so it can be re-sent in
        // place. A regeneration keeps the old reply untouched.
        if (!isRegenerate) {
          const failedKey =
            opts.resendKey ?? (userMsg ? messageKey(userMsg) : null);
          if (failedKey) {
            updateMessage(failedKey, (m) => ({ ...m, failed: true }));
          }
        }
        setError(result.error);
        setIsSending(false);
        setStreamingText("");
      } else if (result.stopped) {
        // User stopped mid-answer: keep whatever was generated so far.
        const partial = useChatStore.getState().streamingText;
        if (partial.trim()) {
          if (isRegenerate) {
            updateMessage(opts.regenerateKey!, (m) => ({
              ...m,
              content: partial,
              sources,
              usage,
              costUsd,
            }));
          } else {
            addMessage({
              role: "assistant",
              content: partial,
              timestamp: new Date().toISOString(),
              ...(sources ? { sources } : {}),
              ...(usage ? { usage } : {}),
              ...(costUsd !== undefined ? { costUsd } : {}),
            });
          }
        }
        setStreamingText("");
        setIsSending(false);
      } else {
        if (isRegenerate) {
          updateMessage(opts.regenerateKey!, (m) => ({
            ...m,
            content: result.content,
            sources,
            usage,
            costUsd,
          }));
        } else {
          addMessage({
            role: "assistant",
            content: result.content,
            timestamp: new Date().toISOString(),
            ...(sources ? { sources } : {}),
            ...(usage ? { usage } : {}),
            ...(costUsd !== undefined ? { costUsd } : {}),
          });
        }
        if (
          result.finishReason === "length" ||
          result.finishReason === "max_tokens"
        ) {
          setReplyNotice(
            "The reply hit the model's output limit and may be incomplete. Ask it to continue if needed.",
          );
        } else if (
          result.finishReason === "content_filter" ||
          result.finishReason === "refusal"
        ) {
          setReplyNotice(
            "The model stopped because of a safety or content filter; rephrasing the request may help.",
          );
        }
        setStreamingText("");
        setIsSending(false);
      }
      controllerRef.current = null;
    },
    [
      isSending,
      addMessage,
      updateMessage,
      application,
      profile,
      loadProfile,
      config,
      setIsSending,
      setError,
      setStreamingText,
      setDraft,
      queueStreamDelta,
      flushStreamBuffer,
      cancelStreamBuffer,
    ],
  );

  // ── Handle send ──
  const handleSend = useCallback(() => {
    void sendText({ text: inputValue });
  }, [inputValue, sendText]);

  // ── Starter button on empty chat ──
  const handleStart = useCallback(() => {
    void sendText({
      text: "Help me answer my application",
      triggerFitEvaluation: true,
    });
  }, [sendText]);

  // ── Show loading state while restoring config ──
  if (!configLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading chat…</p>
      </div>
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
          The chat assistant needs an API key to work. You can use OpenCode Zen,
          Anthropic, OpenAI, or any OpenAI-compatible endpoint. Your key is
          stored securely in your system&apos;s keychain and never leaves your
          computer.
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
          application first, then come back here to craft your cover letter and
          answers.
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
      <MessageList
        onStart={handleStart}
        onResend={(key) => void sendText({ resendKey: key })}
        onRegenerate={(key) => void sendText({ regenerateKey: key })}
      />

      {toolActivity && (
        <p
          role="status"
          className="truncate px-4 pt-2 text-[10px] leading-snug text-primary"
          title={toolActivity.detail}
        >
          {toolActivity.tool === "web_search"
            ? `Searching the web: ${toolActivity.detail}`
            : `Reading: ${toolActivity.detail}`}
        </p>
      )}

      {replyNotice && (
        <p className="px-4 pt-2 text-[10px] leading-snug text-amber-500">
          {replyNotice}
        </p>
      )}

      {contextUsage.dropped > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-2 text-[10px] leading-snug text-text-muted">
          <span>
            {contextUsage.dropped} older message
            {contextUsage.dropped === 1 ? "" : "s"} will be omitted from the
            next request to stay within the context budget.
          </span>
          <button
            type="button"
            onClick={() => void handleSummarizeHistory()}
            disabled={summarizing || isSending}
            className="text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
            title="Summarize the omitted messages so the agent keeps their context"
          >
            {summarizing
              ? "Summarizing…"
              : summaryText
                ? "Update summary"
                : "Summarize omitted messages"}
          </button>
        </div>
      )}

      {summaryError && (
        <p className="px-4 pt-1 text-[10px] leading-snug text-destructive">
          {summaryError}
        </p>
      )}

      {/* Input */}
      <MessageInput
        value={inputValue}
        onChange={setDraft}
        onSend={handleSend}
        onStop={handleStop}
        disabled={isSending}
        tokenEstimate={tokenEstimate}
        contextLimit={contextBudget.inputBudget}
        droppedMessages={contextUsage.dropped}
      />

      {/* Chat agent settings: a modal so the conversation stays visible and
          closing without saving is a real cancel. */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chat agent settings</DialogTitle>
            <DialogDescription>
              Web search and the prompt apply only to the chat agent. Your
              provider, API key and model are configured in Settings.
            </DialogDescription>
          </DialogHeader>
          {showConfig && (
            <ChatSettings
              onDone={() => setShowConfig(false)}
              onOpenSettings={() => {
                setShowConfig(false);
                onOpenSettings();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
