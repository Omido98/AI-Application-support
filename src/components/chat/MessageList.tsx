import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

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
        return (
          <div
            key={msg.timestamp + msg.content.slice(0, 40)}
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
