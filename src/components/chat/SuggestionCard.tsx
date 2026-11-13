import { useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { ChatMessage } from "@/stores/chatStore";
import { diffWords } from "@/utils/diff";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import { Button } from "@/components/ui/button";

interface SuggestionCardProps {
  message: ChatMessage;
  source: ChatMessage | null;
  onAccept: () => void;
  onDiscard: () => void;
}

/**
 * An improve/deslop result is a proposal, not a chat turn. It shows the word
 * diff against the draft it came from and only changes that draft when the
 * user explicitly accepts it.
 */
export default function SuggestionCard({
  message,
  source,
  onAccept,
  onDiscard,
}: SuggestionCardProps) {
  const [showDiff, setShowDiff] = useState(true);
  const diff = useMemo(
    () => diffWords(source?.content ?? "", message.content),
    [source?.content, message.content],
  );

  const title = message.kind === "deslop" ? "Polished draft" : "Improved draft";
  const canAccept = source !== null;

  return (
    <div className="w-full max-w-[75ch] rounded-lg border border-primary/30 bg-surface p-4 text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="font-mono text-[10px] text-text-muted">
            +{diff.added} / −{diff.removed} words
            {diff.truncated ? " (large change)" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDiff((current) => !current)}
          className="rounded px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
          aria-pressed={showDiff}
        >
          {showDiff ? "Show result" : "Show changes"}
        </button>
      </div>

      {!source && (
        <p className="mt-2 text-xs text-destructive">
          The original draft is no longer available, so this suggestion cannot
          be accepted.
        </p>
      )}

      <div className="mt-3 max-h-80 overflow-y-auto rounded border border-border bg-field p-3">
        {showDiff ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {diff.segments.map((segment, index) => (
              <span
                key={index}
                className={cn(
                  segment.type === "add" &&
                    "bg-green-500/15 text-green-700 dark:text-green-300",
                  segment.type === "remove" &&
                    "bg-destructive/15 text-destructive line-through decoration-destructive/50",
                  segment.type === "same" && "text-text-secondary",
                )}
              >
                {segment.text}
              </span>
            ))}
          </p>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard}>
          <X className="mr-1 size-3.5" />
          Discard
        </Button>
        <Button size="sm" onClick={onAccept} disabled={!canAccept}>
          <Check className="mr-1 size-3.5" />
          Accept
        </Button>
      </div>
    </div>
  );
}
