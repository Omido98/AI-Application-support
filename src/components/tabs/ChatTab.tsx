import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isConversationMessage,
  newMessageId,
  selectActiveMessages,
  useChatStore,
  type ChatMessage,
} from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { useAppStore } from "@/stores/useAppStore";
import { sendMessage, type ApiResponse, type ToolActivity } from "@/utils/api";
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

/**
 * Generation and summarization controllers live outside the component so a
 * remount (switching sections) can still stop a request that is still writing
 * into its thread. Keyed by thread: concurrent generations are independent.
 */
const generationControllers = new Map<string, AbortController>();
const summaryControllers = new Map<string, AbortController>();

export default function ChatTab({ onOpenSettings }: ChatTabProps) {
  // ── Stores ──
  const configLoaded = useChatStore((s) => s.configLoaded);
  const config = useChatStore((s) => s.config);
  const loadConfig = useChatStore((s) => s.loadConfig);
  const setConfig = useChatStore((s) => s.setConfig);

  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const activeThread = useChatStore((s) =>
    s.activeThreadId ? s.threads[s.activeThreadId] : undefined,
  );
  const messages = useChatStore(selectActiveMessages);
  const threadLoaded = activeThread?.loaded ?? false;
  const isSending = activeThread?.isSending ?? false;
  const inputValue = activeThread?.draft ?? "";

  const switchThread = useChatStore((s) => s.switchThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendMessageToThread = useChatStore((s) => s.appendMessageToThread);
  const updateMessageInThread = useChatStore((s) => s.updateMessageInThread);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const setThreadSending = useChatStore((s) => s.setThreadSending);
  const setThreadError = useChatStore((s) => s.setThreadError);
  const setThreadStreamingText = useChatStore((s) => s.setThreadStreamingText);
  const setDraft = useChatStore((s) => s.setDraft);

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
  const [summarizingThreadId, setSummarizingThreadId] = useState<string | null>(
    null,
  );
  const [summaryError, setSummaryError] = useState<{
    threadId: string;
    message: string;
  } | null>(null);
  const summarizingHere =
    summarizingThreadId !== null && summarizingThreadId === activeThreadId;

  // ── Load on mount ──
  useEffect(() => {
    if (!configLoaded) loadConfig();
  }, [configLoaded, loadConfig]);

  // ── Load the selected application's thread ──
  useEffect(() => {
    // A thread switch changes what is on screen, not what is in flight: a
    // generation started in another thread keeps writing to that thread.
    setReplyNotice(null);
    setToolActivity(null);
    void switchThread(selectedId);
  }, [selectedId, switchThread]);

  // ── Stop generation (Stop button / Escape key) ──
  const handleStop = useCallback(() => {
    if (activeThreadId) generationControllers.get(activeThreadId)?.abort();
  }, [activeThreadId]);

  const handleStopSummarize = useCallback(() => {
    if (activeThreadId) summaryControllers.get(activeThreadId)?.abort();
  }, [activeThreadId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isSending) {
        e.preventDefault();
        handleStop();
      } else if (summarizingHere) {
        e.preventDefault();
        handleStopSummarize();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSending, summarizingHere, handleStop, handleStopSummarize]);

  // Leaving the chat tab abandons unfinished summaries: a reply for a card
  // the user can no longer see must not land in the thread later. Chat
  // generations are allowed to finish in their own thread.
  useEffect(() => {
    return () => {
      for (const controller of summaryControllers.values()) controller.abort();
      summaryControllers.clear();
    };
  }, []);

  // ── Handle reset chat ──
  const handleReset = useCallback(() => {
    if (activeThreadId) {
      generationControllers.get(activeThreadId)?.abort();
      summaryControllers.get(activeThreadId)?.abort();
      summaryControllers.delete(activeThreadId);
    }
    setSummarizingThreadId((current) =>
      current === activeThreadId ? null : current,
    );
    clearMessages();
    setDraft("");
    setReplyNotice(null);
    setToolActivity(null);
    setSummaryError(null);
    // A fresh thread means web search should behave like a first message
    // again: enabled for the next message, off afterwards by default.
    void setConfig({ webSearchEnabled: false });
    setConfirmReset(false);
  }, [activeThreadId, clearMessages, setDraft, setConfig]);

  const handleSummarizeHistory = useCallback(async () => {
    const threadId = activeThreadId;
    if (!threadId || summarizingThreadId === threadId || isSending) return;
    if (!application) return;

    const thread = useChatStore.getState().threads[threadId];
    const conversation = (thread?.messages ?? []).filter(isConversationMessage);
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
      setSummaryError({
        threadId,
        message:
          "No older messages are being omitted yet; there is nothing to summarize.",
      });
      return;
    }

    // Keep the summarizer request itself bounded for very long threads.
    const dropped = conversation.slice(0, fitted.droppedCount);
    const capped = fitHistoryToBudget(dropped, {
      inputBudget: Math.min(budget.inputBudget, 40_000),
    });
    const lastDropped = capped.messages[capped.messages.length - 1];
    if (!lastDropped) return;

    setSummarizingThreadId(threadId);
    setSummaryError(null);
    const controller = new AbortController();
    summaryControllers.set(threadId, controller);
    try {
      const result = await sendMessage(
        [
          {
            id: newMessageId(),
            role: "user",
            content: "Summarize the earlier conversation.",
            timestamp: new Date().toISOString(),
          },
        ],
        { ...config, webSearchEnabled: false },
        buildConversationSummaryPrompt(capped.messages),
        { signal: controller.signal },
      );
      // A cancelled summary is discarded completely: no error message, no
      // partial note, and no summary card in the thread.
      if (
        controller.signal.aborted ||
        summaryControllers.get(threadId) !== controller
      ) {
        return;
      }
      if (result.error) {
        setSummaryError({ threadId, message: result.error });
        return;
      }
      if (result.stopped || !result.content.trim()) return;

      const existingSummary = useChatStore
        .getState()
        .threads[threadId]?.messages.find(
          (message) => message.kind === "summary",
        );
      if (existingSummary) {
        await updateMessageInThread(
          threadId,
          existingSummary.id,
          (message) => ({
            ...message,
            content: result.content,
            sourceKey: lastDropped.id,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        await appendMessageToThread(threadId, {
          id: newMessageId(),
          role: "assistant",
          content: result.content,
          timestamp: new Date().toISOString(),
          kind: "summary",
          sourceKey: lastDropped.id,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setSummaryError({
        threadId,
        message:
          err instanceof Error
            ? err.message
            : "Could not summarize the earlier conversation.",
      });
    } finally {
      if (summaryControllers.get(threadId) === controller) {
        summaryControllers.delete(threadId);
      }
      setSummarizingThreadId((current) =>
        current === threadId ? null : current,
      );
    }
  }, [
    activeThreadId,
    application,
    appendMessageToThread,
    config,
    inputValue,
    isSending,
    profile,
    summarizingThreadId,
    updateMessageInThread,
  ]);

  // ── Send a message to the chat ──
  // Three modes:
  // - default: `text` is added as a new user message and sent.
  // - `resendId`: an existing failed user message is sent again in place
  //   (no duplicate is created; the failed marker is cleared on the way out).
  // - `regenerateId`: the given assistant message is dropped from the
  //   request history and generated anew; on success it is replaced in
  //   place, and on failure the old reply is kept.
  // `triggerFitEvaluation` is set by the starter button only, so the agent
  // runs the fit evaluation exactly when the user asks for it via the button.
  const sendText = useCallback(
    async (
      opts: {
        text?: string;
        triggerFitEvaluation?: boolean;
        resendId?: string;
        regenerateId?: string;
      } = {},
    ) => {
      const isResend = !!opts.resendId;
      const isRegenerate = !!opts.regenerateId;

      const threadId = useChatStore.getState().activeThreadId;
      if (!threadId || !application) return;
      const threadAtStart = useChatStore.getState().threads[threadId];
      if (!threadAtStart || threadAtStart.isSending) return;

      const messagesBefore = threadAtStart.messages.filter(
        isConversationMessage,
      );

      let targetIndex = -1;
      let target: ChatMessage | null = null;
      let trimmed: string;
      if (isResend || isRegenerate) {
        const lookupId = opts.resendId ?? opts.regenerateId;
        targetIndex = messagesBefore.findIndex((m) => m.id === lookupId);
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
      if (isResend && opts.resendId) {
        updateMessage(threadId, opts.resendId, (m) => ({
          ...m,
          failed: false,
        }));
      }

      // Add the user message only for a fresh send; re-sends reuse the
      // message already in the thread, regenerations keep the old reply
      // until the new one is ready.
      let userMsg: ChatMessage | null = null;
      if (!isResend && !isRegenerate) {
        userMsg = {
          id: newMessageId(),
          role: "user",
          content: trimmed,
          timestamp: new Date().toISOString(),
          ...(isFitEvaluation ? { purpose: "fit-evaluation" as const } : {}),
        };
        addMessage(threadId, userMsg);
      }

      // Send to API. The controller is registered before any await so the
      // Stop button (even from another mount of this tab) can abort it.
      const controller = new AbortController();
      generationControllers.set(threadId, controller);
      setThreadSending(threadId, true);
      setThreadError(threadId, null);
      setThreadStreamingText(threadId, "");
      if (useChatStore.getState().activeThreadId === threadId) {
        setReplyNotice(null);
        setToolActivity(null);
      }

      // Each send owns its batcher and source list, so two threads can stream
      // at the same time without sharing state.
      const batcher = createStreamBatcher(
        (text) =>
          setThreadStreamingText(threadId, (previous) => previous + text),
        (callback) => requestAnimationFrame(callback),
        (handle) => cancelAnimationFrame(handle),
      );
      const sources: WebSource[] = [];
      let toolActivityCleared = false;

      // Application context of the thread this request belongs to.
      const appCtx = applicationContextFrom(application);

      // Make sure the profile has been loaded from disk before it is sent.
      // App startup loads it too; this covers sends racing that load.
      if (!profile.isLoaded) {
        await loadProfile();
      }
      // The user stopped while the profile was loading.
      if (controller.signal.aborted) {
        batcher.cancel();
        generationControllers.delete(threadId);
        setThreadSending(threadId, false);
        setThreadStreamingText(threadId, "");
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

      const conversation = (
        useChatStore.getState().threads[threadId]?.messages ?? []
      ).filter(isConversationMessage);
      // A regeneration drops the old reply from the history so the model
      // answers afresh; the stored message itself stays until replaced.
      const history =
        isRegenerate && opts.regenerateId
          ? conversation.filter((m) => m.id !== opts.regenerateId)
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
              .threads[threadId]?.messages.find(
                (message) => message.kind === "summary",
              )
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
        !sendHistory.some((m) => m.id === opts.resendId)
      ) {
        sendHistory = [...sendHistory, target];
      }

      let result: ApiResponse;
      try {
        result = await sendMessage(
          sendHistory,
          { ...config, webSearchEnabled },
          systemPrompt,
          {
            signal: controller.signal,
            onDelta: (chunk) => {
              batcher.push(chunk);
              if (
                !toolActivityCleared &&
                useChatStore.getState().activeThreadId === threadId
              ) {
                toolActivityCleared = true;
                setToolActivity(null);
              }
            },
            onToolActivity: (activity) => {
              if (useChatStore.getState().activeThreadId === threadId) {
                setToolActivity(activity);
              }
            },
            onSource: (source) => {
              if (sources.some((entry) => entry.url === source.url)) return;
              sources.push(source);
            },
          },
        );
      } catch (err) {
        batcher.cancel();
        generationControllers.delete(threadId);
        setThreadSending(threadId, false);
        setThreadStreamingText(threadId, "");
        setThreadError(
          threadId,
          err instanceof Error ? err.message : "An unknown error occurred.",
        );
        return;
      }

      // Make sure the final buffered chunk reaches the store before the
      // stopped-partial path reads it.
      batcher.flush();
      batcher.cancel();
      const partial =
        useChatStore.getState().threads[threadId]?.streamingText ?? "";
      if (useChatStore.getState().activeThreadId === threadId) {
        setToolActivity(null);
      }
      const sourceList = sources.length > 0 ? sources : undefined;
      const usage = result.usage;
      const costUsd =
        usage && config.provider === "zen"
          ? isFreeModel(config.model)
            ? 0
            : (estimateUsageCost(config.model, usage) ?? undefined)
          : undefined;

      const finishMessage = (content: string): ChatMessage => ({
        id: newMessageId(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
        ...(sourceList ? { sources: sourceList } : {}),
        ...(usage ? { usage } : {}),
        ...(costUsd !== undefined ? { costUsd } : {}),
      });

      if (result.error) {
        // The user's message did not land: flag it so it can be re-sent in
        // place. A regeneration keeps the old reply untouched.
        if (!isRegenerate) {
          const failedId = opts.resendId ?? userMsg?.id;
          if (failedId) {
            updateMessage(threadId, failedId, (m) => ({
              ...m,
              failed: true,
            }));
          }
        }
        setThreadError(threadId, result.error);
      } else if (result.stopped) {
        // User stopped mid-answer: keep whatever was generated so far.
        if (partial.trim()) {
          if (isRegenerate && opts.regenerateId) {
            updateMessage(threadId, opts.regenerateId, (m) => ({
              ...m,
              content: partial,
              sources: sourceList,
              usage,
              costUsd,
            }));
          } else {
            addMessage(threadId, finishMessage(partial));
          }
        }
      } else {
        if (isRegenerate && opts.regenerateId) {
          updateMessage(threadId, opts.regenerateId, (m) => ({
            ...m,
            content: result.content,
            sources: sourceList,
            usage,
            costUsd,
          }));
        } else {
          addMessage(threadId, finishMessage(result.content));
        }
        if (useChatStore.getState().activeThreadId === threadId) {
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
        }
      }
      setThreadStreamingText(threadId, "");
      setThreadSending(threadId, false);
      if (generationControllers.get(threadId) === controller) {
        generationControllers.delete(threadId);
      }
    },
    [
      addMessage,
      updateMessage,
      application,
      profile,
      loadProfile,
      config,
      setThreadSending,
      setThreadError,
      setThreadStreamingText,
      setDraft,
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
        onResend={(id) => void sendText({ resendId: id })}
        onRegenerate={(id) => void sendText({ regenerateId: id })}
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
        <p className="px-4 pt-2 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
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
            disabled={summarizingHere || isSending}
            className="text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
            title="Summarize the omitted messages so the agent keeps their context"
          >
            {summarizingHere
              ? "Summarizing…"
              : summaryText
                ? "Update summary"
                : "Summarize omitted messages"}
          </button>
          {summarizingHere && (
            <button
              type="button"
              onClick={handleStopSummarize}
              className="text-destructive transition-colors hover:text-destructive/80"
              title="Stop summarizing and discard the partial result"
            >
              Stop
            </button>
          )}
        </div>
      )}

      {summaryError && summaryError.threadId === activeThreadId && (
        <p
          role="alert"
          className="px-4 pt-1 text-[10px] leading-snug text-destructive"
        >
          {summaryError.message}
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
