import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** A deletion the user asked for, waiting for confirmation. */
export interface DeleteTarget {
  /** Noun phrase shown in the dialog, e.g. the entry's title. */
  label: string;
  /** Runs when the user confirms the deletion. */
  onConfirm: () => void;
}

interface ConfirmDeleteDialogProps {
  /** The pending deletion, or null when the dialog is closed. */
  target: DeleteTarget | null;
  onClose: () => void;
}

/** Shorten long sub-item text (courses, projects, achievements) for labels. */
export function truncateLabel(text: string, max = 60): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}

/**
 * Confirmation dialog for deleting profile items. Non-empty items only
 * reach this dialog — empty items are deleted instantly by the sections.
 */
export default function ConfirmDeleteDialog({
  target,
  onClose,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete this item?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {target?.label ?? "this item"} from
            your profile? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep item
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              target?.onConfirm();
              onClose();
            }}
          >
            Yes, delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
