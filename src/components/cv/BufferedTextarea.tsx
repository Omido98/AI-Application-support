import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

interface BufferedTextareaProps extends Omit<
  ComponentProps<"textarea">,
  "value" | "defaultValue" | "onChange"
> {
  value: string;
  onCommit: (value: string) => void;
  delayMs?: number;
}

/**
 * Keeps keystrokes local and commits to the CV store once the user pauses or
 * blurs. This avoids rerendering the whole editor for every character while
 * still preserving normal controlled-input behaviour.
 */
export default function BufferedTextarea({
  value,
  onCommit,
  delayMs = 300,
  onBlur,
  ...props
}: BufferedTextareaProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const commitRef = useRef(onCommit);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  // Adopt external changes (generation, restore, rewrite) unless the user is
  // currently editing this field.
  useEffect(() => {
    if (!dirtyRef.current && value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = () => {
    clearTimer();
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current(draftRef.current);
  };

  useEffect(() => {
    return () => {
      clearTimer();
      if (dirtyRef.current) {
        dirtyRef.current = false;
        commitRef.current(draftRef.current);
      }
    };
  }, []);

  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        draftRef.current = next;
        dirtyRef.current = true;
        setDraft(next);
        clearTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (!dirtyRef.current) return;
          dirtyRef.current = false;
          commitRef.current(draftRef.current);
        }, delayMs);
      }}
      onBlur={(event) => {
        flush();
        onBlur?.(event);
      }}
    />
  );
}
