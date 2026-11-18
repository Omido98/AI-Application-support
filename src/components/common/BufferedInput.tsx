import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useBufferedValue } from "@/components/common/useBufferedValue";

interface BufferedInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "onFocus" | "onBlur"
> {
  value: string;
  onCommit: (value: string) => void;
  delayMs?: number;
  onFocus?: ComponentProps<"input">["onFocus"];
  onBlur?: ComponentProps<"input">["onBlur"];
}

/**
 * The input counterpart of `BufferedTextarea`. Use it for short CV/profile
 * fields so typing does not re-render and re-save the whole document on every
 * character, and so trailing spaces are never trimmed mid-edit.
 */
export default function BufferedInput({
  value,
  onCommit,
  delayMs,
  onFocus,
  onBlur,
  ...props
}: BufferedInputProps) {
  const field = useBufferedValue({ value, onCommit, delayMs });
  return (
    <Input
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
