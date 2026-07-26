import { useRef, useCallback, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export default function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSend();
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea (max 4 lines ≈ 4 * 1.5rem = 6rem ≈ 96px)
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

  return (
    <div className="flex items-end gap-2 p-4 border-t border-border bg-background">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Defer height reset to ensure DOM is updated
          requestAnimationFrame(handleInput);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border border-border bg-[#14141f] text-text-primary px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary/50 placeholder:text-text-muted disabled:opacity-50 max-h-[96px] hover:border-primary/30"
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="icon"
        className="bg-primary hover:bg-primary/80 text-primary-foreground shrink-0"
        aria-label="Send message"
      >
        <Send className="size-4" />
      </Button>
    </div>
  );
}
