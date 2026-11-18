/**
 * Chat refine actions (review/improve/deslop) live in MessageList, but Reset
 * Chat lives in ChatTab. Keep their controllers and reset notifications in a
 * tiny shared module so resetting a thread can synchronously abort the action
 * before the conversation is cleared.
 */
const controllers = new Map<string, AbortController>();
const resetListeners = new Set<(threadId: string) => void>();

export function registerChatAction(
  threadId: string,
  controller: AbortController,
): void {
  controllers.get(threadId)?.abort();
  controllers.set(threadId, controller);
}

export function unregisterChatAction(
  threadId: string,
  controller: AbortController,
): void {
  if (controllers.get(threadId) === controller) controllers.delete(threadId);
}

export function abortChatAction(threadId: string): void {
  const controller = controllers.get(threadId);
  controllers.delete(threadId);
  controller?.abort();
}

/** Abort the thread's refine action and notify its UI to clear pending state. */
export function resetChatActions(threadId: string): void {
  abortChatAction(threadId);
  for (const listener of resetListeners) listener(threadId);
}

export function subscribeChatActionReset(
  listener: (threadId: string) => void,
): () => void {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}
