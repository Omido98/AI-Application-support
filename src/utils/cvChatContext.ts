export const CHAT_CONTEXT_MARKER = "Recent chat context (selected manually):";

/** Remove a previously injected chat-context block before appending a new one. */
export function stripChatContext(value: string): string {
  const index = value.indexOf(CHAT_CONTEXT_MARKER);
  if (index === -1) return value.trim();
  return value.slice(0, index).trim();
}

export function mergeChatContext(existing: string, block: string): string {
  return [stripChatContext(existing), block.trim()]
    .filter(Boolean)
    .join("\n\n");
}

export function buildChatContextBlock(
  messages: { role: string; content: string }[],
): string {
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
  if (recent.length === 0) return "";
  return [CHAT_CONTEXT_MARKER, ...recent].join("\n");
}
