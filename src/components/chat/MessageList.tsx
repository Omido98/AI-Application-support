import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "@/stores/chatStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check, BookmarkPlus, Sparkles } from "lucide-react";

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

export default function MessageList({ onStart }: { onStart?: () => void }) {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const error = useChatStore((s) => s.error);
  const bottomRef = useRef<HTMLDivElement>(null);

  const applications = useApplicationStore((s) => s.applications);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const addCoverLetter = useProfileStore((s) => s.addCoverLetter);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const company =
    applications.find((a) => a.id === selectedId)?.companyName ?? "";

  const messageKey = (msg: { timestamp: string; content: string }) =>
    msg.timestamp + msg.content.slice(0, 40);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

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
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
            <div
              className={cn(
                "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-text-primary border border-border",
              )}
            >
              {isUser ? (
                <p>{msg.content}</p>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>

            {!isUser && (
              <div className="flex flex-col gap-1 pl-2 justify-start">
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
              </div>
            )}
          </div>
        );
      })}

      {isSending && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-xl bg-surface text-text-primary border border-border">
            <LoadingDots />
          </div>
        </div>
      )}

      {error && (
        <div className="flex justify-center">
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-2 border border-destructive/20 max-w-lg text-center">
            {error}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
