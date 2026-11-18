import { useCallback, useEffect, useRef, useState } from "react";
import { registerPendingEditFlush } from "@/utils/pendingEdits";

export interface UseBufferedValueOptions {
  /** Current value from the store/document. */
  value: string;
  /** Called with the raw draft when the user pauses, blurs, or the app flushes. */
  onCommit: (value: string) => void;
  /** Pause before an automatic commit. Default 300 ms. */
  delayMs?: number;
}

export interface BufferedValueState {
  /** The raw text shown in the editor. */
  value: string;
  handleChange: (next: string) => void;
  handleFocus: () => void;
  handleBlur: () => void;
}

/**
 * Keep a text editor's value local while it is being edited.
 *
 * The important rule is that a normalized `value` from the store must never
 * replace the draft while the user is focused: that would strip a trailing
 * space or newline mid-typing and make the next keystroke concatenate words or
 * bullets. External updates are adopted only when the field is not being
 * edited, or on blur if one arrived while it was focused and the user had not
 * typed since.
 */
export function useBufferedValue({
  value,
  onCommit,
  delayMs = 300,
}: UseBufferedValueOptions): BufferedValueState {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const commitRef = useRef(onCommit);
  const dirtyRef = useRef(false);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExternalRef = useRef<string | null>(null);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(() => {
    clearTimer();
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    commitRef.current(draftRef.current);
  }, [clearTimer]);

  const commitStableRef = useRef(commit);
  useEffect(() => {
    commitStableRef.current = commit;
  }, [commit]);

  useEffect(
    () => registerPendingEditFlush(() => commitStableRef.current()),
    [],
  );

  // Adopt external changes (generation, restore, rewrite) unless the user is
  // editing this field. A timer commit while focused produces a normalized
  // echo of the draft; remember it for blur instead of replacing the draft.
  useEffect(() => {
    if (focusedRef.current) {
      if (!dirtyRef.current && value !== draftRef.current) {
        pendingExternalRef.current = value;
      }
      return;
    }
    if (dirtyRef.current) return;
    pendingExternalRef.current = null;
    if (value !== draftRef.current) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      pendingExternalRef.current = null;
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
    },
    [clearTimer, delayMs],
  );

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    commit();
    const pending = pendingExternalRef.current;
    pendingExternalRef.current = null;
    if (pending !== null && !dirtyRef.current && pending !== draftRef.current) {
      draftRef.current = pending;
      setDraft(pending);
    }
  }, [commit]);

  // Flush a draft that is still in flight when the editor unmounts.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        commitRef.current(draftRef.current);
      }
    },
    [],
  );

  return { value: draft, handleChange, handleFocus, handleBlur };
}
