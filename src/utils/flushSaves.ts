import { flushChatSave, flushDraftsSave } from "@/stores/chatStore";
import { flushProfileSave } from "@/stores/profileStore";
import { flushApplicationSave } from "@/stores/applicationStore";

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
    flushDraftsSave(),
  ]);
  return results.every(Boolean);
}
