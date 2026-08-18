import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore, messageKey } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { deepImproveDraft, deslopText, improveDraft, reviewDraft } from "@/utils/api";
import type { ImproveStep } from "@/utils/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import type { ProfileData } from "@/types";

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
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
  const streamingText = useChatStore((s) => s.streamingText);
  const error = useChatStore((s) => s.error);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<{ role: "user" | "assistant"; timestamp: string } | null>(
    null,
  );
  const [stickyToBottom, setStickyToBottom] = useState(true);

  const applications = useApplicationStore((s) => s.applications);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const addCoverLetter = useProfileStore((s) => s.addCoverLetter);
  const config = useChatStore((s) => s.config);
  const addMessage = useChatStore((s) => s.addMessage);
  const setError = useChatStore((s) => s.setError);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [deslopPendingId, setDeslopPendingId] = useState<string | null>(null);
  const [reviewPendingId, setReviewPendingId] = useState<string | null>(null);
  const [improvePendingId, setImprovePendingId] = useState<string | null>(null);
  const [deepImprovePendingId, setDeepImprovePendingId] = useState<string | null>(null);
  const [improveStep, setImproveStep] = useState<ImproveStep | null>(null);
  const [improvePreview, setImprovePreview] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyActionPending = !!(
    deslopPendingId || reviewPendingId || improvePendingId || deepImprovePendingId
  );

  const STEP_LABELS: Record<ImproveStep, string> = {
    review: "Reviewing draft…",
    revise: "Revising draft…",
    deslop: "Polishing…",
    verify: "Verifying…",
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
  }, [messages, isSending, streamingText, stickyToBottom]);

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
      content,
      addedAt: new Date().toISOString(),
    });
    flashFeedback(msgId, setSavedId);
  };

  const handleDeslop = async (msgId: string, content: string) => {
    if (!content.trim() || deslopPendingId) return;
    setDeslopPendingId(msgId);
    setError(null);
    const result = await deslopText(content, config);
    setDeslopPendingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.content.trim()) {
      addMessage({
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleReview = async (msgId: string, content: string) => {
    if (!content.trim() || reviewPendingId || !application) return;
    setReviewPendingId(msgId);
    setError(null);

    const appCtx = {
      company: application.companyName,
      jobDescription: application.jobDescription,
      language: application.applicationLanguage,
      requirements: application.requirements,
      companyResearch: application.companyResearch,
    };

    const profileData = await loadProfileData();

    const result = await reviewDraft(content, appCtx, profileData, config);
    setReviewPendingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.content.trim()) {
      addMessage({
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
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
      bio: p.bio,
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
    const pending = depth === "deep" ? deepImprovePendingId : improvePendingId;
    if (!content.trim() || pending || !application) return;
    if (depth === "deep") setDeepImprovePendingId(msgId);
    else setImprovePendingId(msgId);
    setImproveStep("review");
    setImprovePreview("");
    setError(null);

    const appCtx = {
      company: application.companyName,
      jobDescription: application.jobDescription,
      language: application.applicationLanguage,
      requirements: application.requirements,
      companyResearch: application.companyResearch,
    };

    const profileData = await loadProfileData();

    const options = {
      onStep: (step: ImproveStep) => {
        setImproveStep(step);
        // The revise pass streams live; the other steps replace the preview.
        if (step !== "revise") setImprovePreview("");
      },
      onDelta: (text: string) => setImprovePreview((prev) => prev + text),
    };

    const result =
      depth === "deep"
        ? await deepImproveDraft(content, appCtx, profileData, config, options)
        : await improveDraft(content, appCtx, profileData, config, options);

    setImprovePendingId(null);
    setDeepImprovePendingId(null);
    setImproveStep(null);
    setImprovePreview("");
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.content.trim()) {
      addMessage({
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
      });
    }
  };

  if (messages.length === 0 && !isSending) {
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
        const isUser = msg.role === "user";
        const key = messageKey(msg);
        const feedback =
          copiedId === key
            ? "copied"
            : savedId === key
              ? "saved"
              : null;
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
                "whitespace-pre-wrap break-words",
                isUser
                  ? "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-primary text-primary-foreground"
                  : "max-w-[75ch] px-1 py-1 text-text-primary",
              )}
            >
              {isUser ? (
                <p>{msg.content}</p>
              ) : (
                <div className="chat-markdown prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {!isUser && (
              <div className="flex flex-col gap-1 pl-2 justify-start">
                {messages[messages.length - 1] === msg && (
                  <button
                    type="button"
                    onClick={() => onRegenerate?.(key)}
                    disabled={isSending || anyActionPending}
                    className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                    title="Regenerate answer"
                    aria-label="Regenerate answer"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(key, msg.content)}
                  className="text-text-muted hover:text-text-primary transition-colors"
                  title={feedback === "copied" ? "Copied!" : "Copy"}
                  aria-label="Copy message"
                >
                  {feedback === "copied" ? (
                    <Check className="size-3.5 text-green-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAsCoverLetter(key, msg.content)}
                  className="text-text-muted hover:text-text-primary transition-colors"
                  title={
                    feedback === "saved"
                      ? "Saved to Profile"
                      : "Save as cover letter"
                  }
                  aria-label="Save as cover letter"
                >
                  {feedback === "saved" ? (
                    <Check className="size-3.5 text-green-400" />
                  ) : (
                    <BookmarkPlus className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeslop(key, msg.content)}
                  disabled={anyActionPending}
                  className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                  title={
                    deslopPendingId === key
                      ? "Removing AI slop…"
                      : "Remove AI slop"
                  }
                  aria-label="Remove AI slop"
                >
                  {deslopPendingId === key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleReview(key, msg.content)}
                  disabled={anyActionPending}
                  className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                  title={
                    reviewPendingId === key
                      ? "Reviewing draft…"
                      : "Review draft"
                  }
                  aria-label="Review draft"
                >
                  {reviewPendingId === key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => runImprove(key, msg.content, "quick")}
                  disabled={anyActionPending}
                  className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                  title={
                    improvePendingId === key
                      ? (improveStep ? STEP_LABELS[improveStep] : "Improving draft…")
                      : "Improve draft"
                  }
                  aria-label="Improve draft"
                >
                  {improvePendingId === key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => runImprove(key, msg.content, "deep")}
                  disabled={anyActionPending}
                  className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                  title={
                    deepImprovePendingId === key
                      ? (improveStep ? STEP_LABELS[improveStep] : "Deep improving draft…")
                      : "Deep improve draft"
                  }
                  aria-label="Deep improve draft"
                >
                  {deepImprovePendingId === key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {isSending && streamingText ? (
        <div className="flex justify-start">
          <div className="max-w-[75ch] px-1 py-1 text-text-primary break-words">
            <div className="chat-markdown prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingText}
              </ReactMarkdown>
            </div>
            <span
              className="inline-block w-2 h-4 align-middle bg-primary/70 animate-pulse ml-0.5"
              aria-hidden="true"
            />
          </div>
        </div>
      ) : isSending ? (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-xl bg-surface text-text-primary border border-border">
            <LoadingDots />
          </div>
        </div>
      ) : null}

      {(improvePendingId || deepImprovePendingId) && improveStep ? (
        <div className="flex justify-start">
          {improvePreview ? (
            <div className="max-w-[75ch] px-1 py-1 text-text-primary break-words">
              <div className="chat-markdown prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {improvePreview}
                </ReactMarkdown>
              </div>
              <span
                className="inline-block w-2 h-4 align-middle bg-primary/70 animate-pulse ml-0.5"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="max-w-[80%] rounded-xl bg-surface text-text-primary border border-border">
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

      {error && (
        <div className="flex justify-center">
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-2 border border-destructive/20 max-w-lg text-center">
            {error}
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
