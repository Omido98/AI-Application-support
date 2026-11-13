import { useEffect, useRef, useState } from "react";
import {
  isConversationMessage,
  messageKey,
  useChatStore,
} from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { deepImproveDraft, deslopText, improveDraft, reviewDraft } from "@/utils/api";
import type { ImproveStep, ToolActivity } from "@/utils/api";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import ReviewCard from "@/components/chat/ReviewCard";
import StreamingBubble from "@/components/chat/StreamingBubble";
import SuggestionCard from "@/components/chat/SuggestionCard";
import { Button } from "@/components/ui/button";
import { formatTokenCount } from "@/utils/tokens";
import { openExternalUrl } from "@/utils/links";
import { formatUsageCost } from "@/utils/zenPricing";
import { applicationContextFrom } from "@/utils/systemPrompt";
import {
  Copy,
  Check,
  BookmarkPlus,
  Sparkles,
  Loader2,
  ArrowDown,
  ShieldCheck,
  Wand2,
  Zap,
  RotateCcw,
  RefreshCw,
  Link2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ProfileData, WebSource } from "@/types";

function sourceLabel(title: string, url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || title;
  } catch {
    return title;
  }
}

/** Short local clock time plus a full, hoverable/AT-friendly label. */
function formatMessageTime(timestamp: string): { label: string; full: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { label: "", full: "" };
  return {
    label: date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
    full: date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  };
}

/** One item in the assistant message's "Refine" menu. */
function RefineItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  pending,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-field hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

export default function MessageList({
  onStart,
  onResend,
  onRegenerate,
}: {
  onStart?: () => void;
  /** Re-send a failed user message in place (no duplicate is created). */
  onResend?: (key: string) => void;
  /** Regenerate the latest assistant message, replacing it in place. */
  onRegenerate?: (key: string) => void;
}) {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const error = useChatStore((s) => s.error);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<{ role: "user" | "assistant"; timestamp: string } | null>(
    null,
  );
  const [stickyToBottom, setStickyToBottom] = useState(true);
  const stickyRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);

  const applications = useApplicationStore((s) => s.applications);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const addCoverLetter = useProfileStore((s) => s.addCoverLetter);
  const config = useChatStore((s) => s.config);
  const appendMessageToThread = useChatStore((s) => s.appendMessageToThread);
  const removeMessageInThread = useChatStore((s) => s.removeMessageInThread);
  const acceptSuggestion = useChatStore((s) => s.acceptSuggestion);
  const setError = useChatStore((s) => s.setError);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deslopPendingId, setDeslopPendingId] = useState<string | null>(null);
  const [reviewPendingId, setReviewPendingId] = useState<string | null>(null);
  const [improvePendingId, setImprovePendingId] = useState<string | null>(null);
  const [deepImprovePendingId, setDeepImprovePendingId] = useState<string | null>(null);
  const [openRefineKey, setOpenRefineKey] = useState<string | null>(null);
  const [improveStep, setImproveStep] = useState<ImproveStep | null>(null);
  const [improvePreview, setImprovePreview] = useState("");
  const [actionActivity, setActionActivity] = useState<ToolActivity | null>(null);
  const actionControllerRef = useRef<AbortController | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyActionPending = !!(
    deslopPendingId || reviewPendingId || improvePendingId || deepImprovePendingId
  );

  /** Refine actions must not overlap a chat generation or another action. */
  const actionsBlocked = isSending || anyActionPending;

  /** Refuse to write a result into an application that was deleted meanwhile. */
  const threadStillExists = (threadId: string) =>
    useApplicationStore.getState().applications.some((app) => app.id === threadId);

  /**
   * Errors belong to the thread the action started in. If the user has moved
   * on, keep the current thread calm and leave a breadcrumb for debugging.
   */
  const reportActionError = (threadId: string, message: string) => {
    if (useChatStore.getState().activeThreadId === threadId) {
      setError(message);
    } else {
      console.warn(`[chat] Action failed in inactive thread ${threadId}: ${message}`);
    }
  };

  const STEP_LABELS: Record<ImproveStep, string> = {
    review: "Reviewing draft…",
    revise: "Revising draft…",
    deslop: "Polishing…",
    verify: "Verifying…",
  };

  const actionLabel = improveStep
    ? STEP_LABELS[improveStep]
    : reviewPendingId
      ? "Reviewing draft…"
      : deslopPendingId
        ? "Polishing draft…"
        : "Working…";

  const stopAction = () => actionControllerRef.current?.abort();

  useEffect(() => {
    if (!anyActionPending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      actionControllerRef.current?.abort();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyActionPending]);

  useEffect(() => {
    if (!openRefineKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenRefineKey(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openRefineKey]);

  const handleAcceptSuggestion = async (msg: (typeof messages)[number]) => {
    const threadId = useChatStore.getState().activeThreadId;
    if (!threadId || !msg.sourceKey) return;
    await acceptSuggestion(threadId, messageKey(msg), msg.sourceKey);
  };

  const handleDiscardMessage = async (msg: (typeof messages)[number]) => {
    const threadId = useChatStore.getState().activeThreadId;
    if (!threadId) return;
    await removeMessageInThread(threadId, messageKey(msg));
  };

  const application =
    applications.find((a) => a.id === selectedId) ?? null;

  const company = application?.companyName ?? "";

  // Auto-scroll to the bottom only while the user is already near the bottom,
  // so scrolling up to read is never hijacked — even during live streaming.
  // A newly sent user message always jumps to the bottom.
  useEffect(() => {
    const last = messages[messages.length - 1] ?? null;
    const isNewUserMessage =
      last?.role === "user" && lastMessageRef.current?.timestamp !== last.timestamp;
    lastMessageRef.current = last;

    if (isNewUserMessage || stickyToBottom) {
      bottomRef.current?.scrollIntoView({
        behavior: isSending ? "auto" : "smooth",
      });
    }
  }, [messages, isSending, stickyToBottom]);

  useEffect(() => {
    stickyRef.current = stickyToBottom;
  }, [stickyToBottom]);

  // Follow the streamed text without re-rendering the whole list: subscribe
  // to the store directly and coalesce scroll work into one animation frame.
  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state, previous) => {
      if (state.streamingText === previous.streamingText) return;
      if (!stickyRef.current || scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        bottomRef.current?.scrollIntoView({ behavior: "auto" });
      });
    });
    return () => {
      unsubscribe();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setStickyToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const jumpToBottom = () => {
    setStickyToBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  };

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const flashFeedback = (id: string, setter: (v: string | null) => void) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setter(id);
    feedbackTimer.current = setTimeout(() => {
      setter(null);
      feedbackTimer.current = null;
    }, 1500);
  };

  const handleCopy = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard unavailable — fall back to a textarea selection trick
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    flashFeedback(msgId, setCopiedId);
  };

  const handleSaveAsCoverLetter = (msgId: string, content: string) => {
    addCoverLetter({
      id: crypto.randomUUID(),
      company: company || undefined,
      applicationId: application?.id,
      content,
      addedAt: new Date().toISOString(),
    });
    flashFeedback(msgId, setSavedId);
  };

  const handleDeslop = async (msgId: string, content: string) => {
    const threadId = useChatStore.getState().activeThreadId;
    if (
      !content.trim() ||
      deslopPendingId ||
      anyActionPending ||
      !threadId ||
      useChatStore.getState().isSending
    ) {
      return;
    }
    const controller = new AbortController();
    actionControllerRef.current = controller;
    setDeslopPendingId(msgId);
    setActionActivity(null);
    setError(null);
    const sources: WebSource[] = [];
    const result = await deslopText(content, config, {
      signal: controller.signal,
      onSource: (source) => {
        if (!sources.some((entry) => entry.url === source.url)) {
          sources.push(source);
        }
      },
    });
    setDeslopPendingId(null);
    setActionActivity(null);
    if (actionControllerRef.current === controller) {
      actionControllerRef.current = null;
    }
    if (controller.signal.aborted || result.stopped) return;
    if (result.error) {
      reportActionError(threadId, result.error);
      return;
    }
    if (result.content.trim() && threadStillExists(threadId)) {
      await appendMessageToThread(threadId, {
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
        kind: "deslop",
        sourceKey: msgId,
        ...(sources.length > 0 ? { sources } : {}),
      });
    }
  };

  const handleReview = async (msgId: string, content: string) => {
    const threadId = useChatStore.getState().activeThreadId;
    if (
      !content.trim() ||
      reviewPendingId ||
      anyActionPending ||
      !application ||
      !threadId ||
      useChatStore.getState().isSending
    ) {
      return;
    }
    const controller = new AbortController();
    actionControllerRef.current = controller;
    setReviewPendingId(msgId);
    setActionActivity(null);
    setError(null);

    const appCtx = applicationContextFrom(application);

    const profileData = await loadProfileData();
    const sources: WebSource[] = [];
    const result = await reviewDraft(content, appCtx, profileData, config, {
      signal: controller.signal,
      onToolActivity: setActionActivity,
      onSource: (source) => {
        if (!sources.some((entry) => entry.url === source.url)) {
          sources.push(source);
        }
      },
    });
    setReviewPendingId(null);
    setActionActivity(null);
    if (actionControllerRef.current === controller) {
      actionControllerRef.current = null;
    }
    if (controller.signal.aborted || result.stopped) return;
    if (result.error) {
      reportActionError(threadId, result.error);
      return;
    }
    if (result.content.trim() && threadStillExists(threadId)) {
      await appendMessageToThread(threadId, {
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
        kind: "review",
        sourceKey: msgId,
        ...(sources.length > 0 ? { sources } : {}),
      });
    }
  };

  /** Ensure the profile is loaded from disk and return it as plain data. */
  const loadProfileData = async (): Promise<ProfileData> => {
    const profileState = useProfileStore.getState();
    if (!profileState.isLoaded) {
      await profileState.loadProfile();
    }
    const p = useProfileStore.getState();
    return {
      fullName: p.fullName,
      email: p.email,
      city: p.city,
      country: p.country,
      linkedinUrl: p.linkedinUrl,
      coverLetterSummary: p.coverLetterSummary,
      interests: p.interests,
      education: p.education,
      coverLetters: p.coverLetters,
      workExperience: p.workExperience,
      otherEngagements: p.otherEngagements,
      certifications: p.certifications,
      skills: p.skills,
      languages: p.languages,
    };
  };

  /**
   * Run the improve pipeline on an assistant message. Quick mode does a
   * single review → revise → polish pass; deep mode re-checks each round
   * with a cheap verifier and iterates until the draft passes.
   */
  const runImprove = async (
    msgId: string,
    content: string,
    depth: "quick" | "deep",
  ) => {
    const threadId = useChatStore.getState().activeThreadId;
    const pending = depth === "deep" ? deepImprovePendingId : improvePendingId;
    if (
      !content.trim() ||
      pending ||
      anyActionPending ||
      !application ||
      !threadId ||
      useChatStore.getState().isSending
    ) {
      return;
    }
    if (depth === "deep") setDeepImprovePendingId(msgId);
    else setImprovePendingId(msgId);
    const controller = new AbortController();
    actionControllerRef.current = controller;
    setImproveStep("review");
    setImprovePreview("");
    setActionActivity(null);
    setError(null);

    const appCtx = applicationContextFrom(application);

    const profileData = await loadProfileData();
    const sources: WebSource[] = [];

    const options = {
      signal: controller.signal,
      onStep: (step: ImproveStep) => {
        setImproveStep(step);
        // The revise pass streams live; the other steps replace the preview.
        if (step !== "revise") setImprovePreview("");
      },
      onDelta: (text: string) => setImprovePreview((prev) => prev + text),
      onToolActivity: setActionActivity,
      onSource: (source: WebSource) => {
        if (!sources.some((entry) => entry.url === source.url)) {
          sources.push(source);
        }
      },
    };

    const result =
      depth === "deep"
        ? await deepImproveDraft(content, appCtx, profileData, config, options)
        : await improveDraft(content, appCtx, profileData, config, options);

    setImprovePendingId(null);
    setDeepImprovePendingId(null);
    setImproveStep(null);
    setImprovePreview("");
    setActionActivity(null);
    if (actionControllerRef.current === controller) {
      actionControllerRef.current = null;
    }
    if (controller.signal.aborted || result.stopped) return;
    if (result.error) {
      reportActionError(threadId, result.error);
      return;
    }
    if (result.content.trim() && threadStillExists(threadId)) {
      await appendMessageToThread(threadId, {
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
        kind: "improve",
        sourceKey: msgId,
        ...(sources.length > 0 ? { sources } : {}),
      });
    }
  };

  const lastConversationKey = (() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (isConversationMessage(messages[index])) {
        return messageKey(messages[index]);
      }
    }
    return null;
  })();

  const hasVisibleMessages = messages.some(
    (message) => message.kind !== "summary",
  );

  if (!hasVisibleMessages && !isSending) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md space-y-4">
          <p className="text-text-muted text-sm">
            Send a message to start the conversation. The AI will help you craft
            your job application.
          </p>
          <Button
            onClick={onStart}
            className="bg-primary hover:bg-primary/80 text-primary-foreground"
          >
            <Sparkles className="size-4 mr-1.5" />
            Help me answer my application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((msg) => {
        if (msg.kind === "summary") return null;
        const isUser = msg.role === "user";
        const key = messageKey(msg);
        const time = formatMessageTime(msg.timestamp);
        const feedback =
          copiedId === key
            ? "copied"
            : savedId === key
              ? "saved"
              : null;

        if (!isUser && (msg.kind === "improve" || msg.kind === "deslop")) {
          const source = msg.sourceKey
            ? messages.find(
                (candidate) => messageKey(candidate) === msg.sourceKey,
              ) ?? null
            : null;
          return (
            <div key={key} className="flex justify-start">
              <SuggestionCard
                message={msg}
                source={source}
                onAccept={() => void handleAcceptSuggestion(msg)}
                onDiscard={() => void handleDiscardMessage(msg)}
              />
            </div>
          );
        }

        if (!isUser && msg.kind === "review") {
          const source = msg.sourceKey
            ? messages.find(
                (candidate) => messageKey(candidate) === msg.sourceKey,
              ) ?? null
            : null;
          return (
            <div key={key} className="flex justify-start">
              <ReviewCard
                message={msg}
                source={source}
                onDiscard={() => void handleDiscardMessage(msg)}
              />
            </div>
          );
        }

        return (
          <div
            key={key}
            className={cn(
              "flex",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {isUser && msg.failed && (
              <div className="flex flex-col gap-1 pr-2 justify-start">
                <button
                  type="button"
                  onClick={() => onResend?.(key)}
                  disabled={isSending || anyActionPending}
                  className="text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                  title="Re-send message"
                  aria-label="Re-send message"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            )}

            <div
              className={cn(
                "flex flex-col",
                isUser ? "items-end max-w-[80%]" : "items-start max-w-[75ch]",
              )}
            >
              <div
                className={cn(
                  "whitespace-pre-wrap break-words",
                  isUser
                    ? "rounded-lg px-4 py-3 text-sm leading-relaxed bg-primary text-primary-foreground"
                    : "rounded-lg bg-surface text-text-primary border border-border px-4 py-3",
                )}
              >
                {isUser ? (
                  <p>{msg.content}</p>
                ) : (
                  <Markdown>{msg.content}</Markdown>
                )}

                {!isUser && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                    {msg.sources.map((source) => (
                      <button
                        key={source.url}
                        type="button"
                        onClick={() => openExternalUrl(source.url)}
                        title={`${source.title} — ${source.url}`}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-field px-2 py-0.5 text-[10px] text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <Link2 className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {sourceLabel(source.title, source.url)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!isUser && msg.usage && (
                  <p className="mt-1.5 font-mono text-[10px] leading-none text-text-muted">
                    {[
                      msg.usage.inputTokens !== undefined
                        ? `${formatTokenCount(msg.usage.inputTokens)} in`
                        : null,
                      msg.usage.outputTokens !== undefined
                        ? `${formatTokenCount(msg.usage.outputTokens)} out`
                        : null,
                      msg.costUsd !== undefined
                        ? formatUsageCost(msg.costUsd)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {time.label && (
                <time
                  dateTime={msg.timestamp}
                  title={time.full}
                  aria-label={`Sent ${time.full}`}
                  className="mt-1 select-text px-0.5 font-mono text-[10px] leading-none text-text-muted"
                >
                  {time.label}
                </time>
              )}
            </div>

            {!isUser && (
              <div className="relative flex flex-col gap-0.5 pl-1">
                {lastConversationKey === key && (
                  <button
                    type="button"
                    onClick={() => onRegenerate?.(key)}
                    disabled={isSending || anyActionPending}
                    className="rounded p-1 text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                    title="Regenerate answer"
                    aria-label="Regenerate answer"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(key, msg.content)}
                  className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                  title={feedback === "copied" ? "Copied!" : "Copy"}
                  aria-label="Copy message"
                >
                  {feedback === "copied" ? (
                    <Check className="size-4 text-green-400" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAsCoverLetter(key, msg.content)}
                  className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                  title={
                    feedback === "saved"
                      ? "Saved to Profile"
                      : "Save as cover letter"
                  }
                  aria-label="Save as cover letter"
                >
                  {feedback === "saved" ? (
                    <Check className="size-4 text-green-400" />
                  ) : (
                    <BookmarkPlus className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOpenRefineKey(openRefineKey === key ? null : key)
                  }
                  disabled={actionsBlocked}
                  className={
                    openRefineKey === key
                      ? "rounded bg-field p-1 text-text-primary transition-colors disabled:opacity-50"
                      : "rounded p-1 text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                  }
                  title="Refine draft"
                  aria-label="Refine draft"
                  aria-haspopup="menu"
                  aria-expanded={openRefineKey === key}
                >
                  {reviewPendingId === key ||
                  improvePendingId === key ||
                  deepImprovePendingId === key ||
                  deslopPendingId === key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </button>

                {openRefineKey === key && (
                  <div
                    role="menu"
                    aria-label="Refine draft"
                    className="absolute right-full top-0 z-20 mr-1 w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
                  >
                    <RefineItem
                      icon={ShieldCheck}
                      label="Review draft"
                      pending={reviewPendingId === key}
                      disabled={actionsBlocked}
                      onClick={() => {
                        setOpenRefineKey(null);
                        void handleReview(key, msg.content);
                      }}
                    />
                    <RefineItem
                      icon={Wand2}
                      label="Improve draft"
                      pending={improvePendingId === key}
                      disabled={actionsBlocked}
                      onClick={() => {
                        setOpenRefineKey(null);
                        void runImprove(key, msg.content, "quick");
                      }}
                    />
                    <RefineItem
                      icon={Zap}
                      label="Deep improve"
                      pending={deepImprovePendingId === key}
                      disabled={actionsBlocked}
                      onClick={() => {
                        setOpenRefineKey(null);
                        void runImprove(key, msg.content, "deep");
                      }}
                    />
                    <RefineItem
                      icon={Sparkles}
                      label="Remove AI slop"
                      pending={deslopPendingId === key}
                      disabled={actionsBlocked}
                      onClick={() => {
                        setOpenRefineKey(null);
                        void handleDeslop(key, msg.content);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <StreamingBubble />

      {(improvePendingId || deepImprovePendingId) && improveStep ? (
        <div className="flex justify-start">
          {improvePreview ? (
            <div className="max-w-[75ch] rounded-lg bg-surface text-text-primary border border-border px-4 py-3 break-words">
              <Markdown>{improvePreview}</Markdown>
              <span
                className="inline-block w-2 h-4 align-middle bg-primary/70 animate-pulse ml-0.5"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="max-w-[80%] rounded-lg bg-surface text-text-primary border border-border">
              <div className="flex items-center gap-2 px-4 py-3">
                <Loader2 className="size-4 animate-spin text-text-muted" />
                <span className="text-sm text-text-muted">
                  {STEP_LABELS[improveStep]}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {anyActionPending && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 text-xs text-text-muted"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <span>
            {actionActivity
              ? actionActivity.tool === "web_search"
                ? `Searching the web: ${actionActivity.detail}`
                : `Reading: ${actionActivity.detail}`
              : actionLabel}
          </span>
          <button
            type="button"
            onClick={stopAction}
            className="text-primary hover:text-primary/80"
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <div
            role="alert"
            className="relative max-w-lg rounded-lg border border-destructive/20 bg-destructive/10 py-2 pl-4 pr-9 text-center text-sm text-destructive"
          >
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              title="Dismiss"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-destructive/70 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      {!stickyToBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="sticky bottom-0 mx-auto w-fit z-10 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm hover:text-text-primary transition-colors flex items-center gap-1.5"
          title="Jump to latest message"
          aria-label="Jump to latest message"
        >
          <ArrowDown className="size-3.5" />
          Latest
        </button>
      )}
    </div>
  );
}
