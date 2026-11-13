import { ShieldCheck, X } from "lucide-react";
import type { ChatMessage } from "@/stores/chatStore";
import { parseReviewVerdict } from "@/utils/api";
import { cn } from "@/lib/utils";
import Markdown from "@/components/chat/Markdown";
import { Button } from "@/components/ui/button";

interface ReviewCardProps {
  message: ChatMessage;
  source: ChatMessage | null;
  onDiscard: () => void;
}

/**
 * Reviewer feedback is analysis, not an assistant turn. Keeping it in a
 * dedicated card (and out of the model's conversation history) prevents it
 * from being mistaken for a draft or inflating later requests.
 */
export default function ReviewCard({
  message,
  source,
  onDiscard,
}: ReviewCardProps) {
  const verdict = parseReviewVerdict(message.content);

  return (
    <div className="w-full max-w-[75ch] rounded-lg border border-border bg-surface p-4 text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Draft review</h3>
          {verdict !== "unknown" && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                verdict === "pass"
                  ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {verdict === "pass" ? "Pass" : "Revise"}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          <X className="mr-1 size-3.5" />
          Dismiss
        </Button>
      </div>

      {source && (
        <p className="mt-1 truncate text-[11px] text-text-muted">
          Reviewed draft: {source.content.slice(0, 120).trim()}
          {source.content.length > 120 ? "…" : ""}
        </p>
      )}

      <div className="mt-3 max-h-96 overflow-y-auto rounded border border-border bg-field p-3">
        <Markdown>{message.content}</Markdown>
      </div>
    </div>
  );
}
