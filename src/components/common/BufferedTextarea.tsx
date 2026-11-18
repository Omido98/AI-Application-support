import type { ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useBufferedValue } from "@/components/common/useBufferedValue";

interface BufferedTextareaProps extends Omit<
  ComponentProps<"textarea">,
  "value" | "defaultValue" | "onChange" | "onFocus" | "onBlur"
> {
  value: string;
  onCommit: (value: string) => void;
  delayMs?: number;
  onFocus?: ComponentProps<"textarea">["onFocus"];
  onBlur?: ComponentProps<"textarea">["onBlur"];
}

/**
 * A textarea that keeps keystrokes local and commits once the user pauses or
 * blurs. The raw draft is never replaced by a normalized store value while the
 * user is editing it; see `useBufferedValue`.
 */
export default function BufferedTextarea({
  value,
  onCommit,
  delayMs,
  onFocus,
  onBlur,
  ...props
}: BufferedTextareaProps) {
  const field = useBufferedValue({ value, onCommit, delayMs });
  return (
    <Textarea
      {...props}
      value={field.value}
      onChange={(event) => field.handleChange(event.target.value)}
      onFocus={(event) => {
        field.handleFocus();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        field.handleBlur();
        onBlur?.(event);
      }}
    />
  );
}
