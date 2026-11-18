import { flushChatSave, flushDraftsSave } from "@/stores/chatStore";
import { flushProfileSave } from "@/stores/profileStore";
import { flushApplicationSave } from "@/stores/applicationStore";
import { flushCvSaves } from "@/stores/cvStore";
import { flushSettingsSave } from "@/stores/settingsStore";
import { flushPendingEdits } from "@/utils/pendingEdits";

/**
 * Flush every debounced save and report whether all writes succeeded.
 * Used before closing the window and before export/import, so the backup and
 * the on-disk data can never be one debounce tick behind the UI.
 */
export async function flushAllSaves(): Promise<boolean> {
  // Commit drafts that still live inside a BufferedTextarea before any store
  // snapshot or file write is taken.
  flushPendingEdits();
  const results = await Promise.all([
    flushApplicationSave(),
    flushProfileSave(),
    flushChatSave(),
    flushDraftsSave(),
    flushCvSaves(),
    flushSettingsSave(),
  ]);
  return results.every(Boolean);
}
