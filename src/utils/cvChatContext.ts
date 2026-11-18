export const CHAT_CONTEXT_MARKER = "Recent chat context (selected manually):";
export const CHAT_CONTEXT_END_MARKER = "End of recent chat context.";

function trimmed(lines: string[]): string {
  return lines
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Remove a previously injected chat-context block. New blocks have an explicit
 * end marker, so notes typed after the block survive. Legacy blocks are detected
 * by their generated Candidate/Assistant lines.
 */
export function stripChatContext(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const start = lines.findIndex((line) => line.trim() === CHAT_CONTEXT_MARKER);
  if (start === -1) return value.trim();

  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === CHAT_CONTEXT_END_MARKER,
  );
  if (end !== -1) {
    lines.splice(start, end - start + 1);
    return trimmed(lines);
  }

  // Legacy block: consume only the generated transcript lines and keep any
  // user-authored text that follows them.
  let cursor = start + 1;
  while (
    cursor < lines.length &&
    (lines[cursor].trim() === "" ||
      /^(Candidate|Assistant):\s/.test(lines[cursor]))
  ) {
    cursor += 1;
  }
  lines.splice(start, cursor - start);
  return trimmed(lines);
}

export function mergeChatContext(existing: string, block: string): string {
  return [stripChatContext(existing), block.trim()]
    .filter(Boolean)
    .join("\n\n");
}

export interface ChatContextBlock {
  block: string;
  count: number;
}

export function buildChatContextBlock(
  messages: {
    role: string;
    content: string;
  }[],
): ChatContextBlock {
  const recent = messages
    .filter((message) => message.content.trim())
    .slice(-8)
    .map(
      (message) =>
        `${message.role === "user" ? "Candidate" : "Assistant"}: ${message.content
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500)}`,
    );
  if (recent.length === 0) return { block: "", count: 0 };
  return {
    block: [CHAT_CONTEXT_MARKER, ...recent, CHAT_CONTEXT_END_MARKER].join("\n"),
    count: recent.length,
  };
}
