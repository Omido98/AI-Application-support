import type { ChatMessage } from "@/stores/chatStore";
import {
  CONTEXT_SAFETY_MARGIN,
  DEFAULT_CONTEXT_OUTPUT_RESERVE,
  DEFAULT_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
  estimateTokens,
} from "@/utils/tokens";

/** Approximate per-message framing cost for role/content JSON. */
export const MESSAGE_OVERHEAD_TOKENS = 4;

export interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  /** Maximum tokens available for system prompt + history + draft. */
  inputBudget: number;
}

export interface FittedHistory {
  messages: ChatMessage[];
  droppedCount: number;
  historyTokens: number;
  availableTokens: number;
  /** True when even the newest message does not fit the budget. */
  overBudget: boolean;
}

/**
 * Split a model's usable context window into reply space, safety headroom,
 * and the input budget. Invalid or tiny configured values fall back to the
 * conservative default instead of producing a negative budget.
 */
export function getContextBudget(contextWindow?: number | null): ContextBudget {
  const window =
    typeof contextWindow === "number" &&
    Number.isFinite(contextWindow) &&
    contextWindow >= MIN_CONTEXT_WINDOW
      ? Math.floor(contextWindow)
      : DEFAULT_CONTEXT_WINDOW;
  // Keep at least 1k output tokens and never reserve more than a quarter of
  // the window; the latter matters for small local models.
  const outputReserve = Math.max(
    1_024,
    Math.min(DEFAULT_CONTEXT_OUTPUT_RESERVE, Math.floor(window * 0.25)),
  );
  return {
    contextWindow: window,
    outputReserve,
    inputBudget: Math.max(
      1_024,
      window - outputReserve - CONTEXT_SAFETY_MARGIN,
    ),
  };
}

/**
 * Keep the newest messages that fit `inputBudget - reservedTokens`.
 *
 * Trimming stops on a user message boundary: Anthropic's Messages API expects
 * a user-first conversation, and a history starting with an assistant reply
 * would otherwise be rejected. The newest message is always kept, even when it
 * alone exceeds the budget, so the caller can still report a useful
 * over-budget state.
 */
export function fitHistoryToBudget(
  messages: ChatMessage[],
  options: {
    inputBudget: number;
    /** Tokens already consumed by the system prompt and typed draft. */
    reservedTokens?: number;
  },
): FittedHistory {
  const availableTokens = Math.max(
    0,
    options.inputBudget - (options.reservedTokens ?? 0),
  );

  let start = messages.length;
  let total = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const cost =
      estimateTokens(messages[index].content) + MESSAGE_OVERHEAD_TOKENS;
    // Always keep the newest message; older messages only while they fit.
    if (total > 0 && total + cost > availableTokens) break;
    total += cost;
    start = index;
  }

  let kept = messages.slice(start);
  // Drop leading assistant messages so the request starts with a user turn.
  while (kept.length > 0 && kept[0].role !== "user") {
    kept = kept.slice(1);
  }
  if (kept.length === 0) {
    // No user message in the selected suffix: fall back to the newest user
    // turn, or the newest message if the thread is assistant-only.
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    kept = lastUserIndex >= 0 ? [messages[lastUserIndex]] : messages.slice(-1);
  }

  const historyTokens = kept.reduce(
    (sum, message) =>
      sum + estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS,
    0,
  );
  return {
    messages: kept,
    droppedCount: messages.length - kept.length,
    historyTokens,
    availableTokens,
    overBudget: historyTokens > availableTokens,
  };
}
