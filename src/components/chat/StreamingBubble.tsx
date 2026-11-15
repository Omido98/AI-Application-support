import { useChatStore } from "@/stores/chatStore";
import Markdown from "@/components/chat/Markdown";

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
      <span className="size-2 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

/**
 * Presentational view, separated so it can be rendered in tests without a
 * DOM or the Zustand store.
 */
export function StreamingBubbleView({
  isSending,
  streamingText,
}: {
  isSending: boolean;
  streamingText: string;
}) {
  if (!isSending) return null;

  if (!streamingText) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-lg bg-surface text-text-primary border border-border">
          <LoadingDots />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75ch] rounded-lg bg-surface text-text-primary border border-border px-4 py-3 break-words">
        <Markdown>{streamingText}</Markdown>
        <span
          className="inline-block w-2 h-4 align-middle bg-primary/70 animate-pulse ml-0.5"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/**
 * The only component that subscribes to `streamingText`.
 *
 * Keeping live tokens here means a delta only re-renders this bubble and its
 * Markdown, not every message in the thread. MessageList subscribes to the
 * store separately for auto-scroll without re-rendering.
 */
export default function StreamingBubble() {
  const isSending = useChatStore((s) => s.isSending);
  const streamingText = useChatStore((s) => s.streamingText);

  return (
    <StreamingBubbleView isSending={isSending} streamingText={streamingText} />
  );
}
