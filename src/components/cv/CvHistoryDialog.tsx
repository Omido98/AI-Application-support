import { History, Loader2 } from "lucide-react";
import type { CvSnapshot } from "@/types/cv";
import { formatCvUsage } from "@/utils/cvUsage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CvHistoryDialog({
  open,
  snapshots,
  busy,
  onClose,
  onRestore,
}: {
  open: boolean;
  snapshots: CvSnapshot[];
  busy: boolean;
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>CV versions</DialogTitle>
          <DialogDescription>
            The last {snapshots.length} saved version
            {snapshots.length === 1 ? "" : "s"}. Restoring snapshots the current
            CV first, so you can switch back.
          </DialogDescription>
        </DialogHeader>

        {snapshots.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-muted">
            No previous versions yet. Versions are saved before AI regeneration,
            before an accepted rewrite, before removing an entry and before a
            restore.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-field/40 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {snapshot.label}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {new Date(snapshot.savedAt).toLocaleString()}
                    {snapshot.document.lastUsage
                      ? ` · ${formatCvUsage(snapshot.document.lastUsage)}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(snapshot.id)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <History className="size-3.5" />
                  )}
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
