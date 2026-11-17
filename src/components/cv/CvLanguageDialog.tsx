import { Loader2, Sparkles } from "lucide-react";
import type { CvLanguage } from "@/types/cv";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LANGUAGE_NAME: Record<CvLanguage, string> = {
  en: "English",
  sv: "Swedish",
};

export default function CvLanguageDialog({
  open,
  current,
  next,
  busy,
  canRegenerate,
  onClose,
  onHeadingsOnly,
  onRegenerate,
}: {
  open: boolean;
  current: CvLanguage;
  next: CvLanguage | null;
  busy: boolean;
  canRegenerate: boolean;
  onClose: () => void;
  onHeadingsOnly: () => void;
  onRegenerate: () => void;
}) {
  if (!next) return null;
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Change CV language to {LANGUAGE_NAME[next]}?
          </DialogTitle>
          <DialogDescription>
            The CV is currently in {LANGUAGE_NAME[current]}. Changing headings
            alone leaves the body text in the old language and can produce a
            mixed-language export. Regenerating rewrites the body with AI and
            keeps the previous CV in Versions.
          </DialogDescription>
        </DialogHeader>

        {!canRegenerate && (
          <p className="rounded-md border border-border bg-field p-2 text-xs text-text-secondary">
            Add a profile, job description and AI provider to regenerate the
            body. You can still change the headings and edit manually.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onHeadingsOnly} disabled={busy}>
              Change headings only
            </Button>
            <Button onClick={onRegenerate} disabled={!canRegenerate || busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Regenerate in {LANGUAGE_NAME[next]}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
