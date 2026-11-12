import { flushApplicationSave } from "@/stores/applicationStore";
import { flushProfileSave } from "@/stores/profileStore";
import { flushChatSave } from "@/stores/chatStore";

/**
 * Flush every debounced save and report whether all writes succeeded.
 * Used before closing the window and before export/import, so the backup and
 * the on-disk data can never be one debounce tick behind the UI.
 */
export async function flushAllSaves(): Promise<boolean> {
  const results = await Promise.all([
    flushApplicationSave(),
    flushProfileSave(),
    flushChatSave(),
  ]);
  return results.every(Boolean);
}
