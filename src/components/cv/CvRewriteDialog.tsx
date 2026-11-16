import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CvRewriteDialog({
  open,
  label,
  busy,
  error,
  onClose,
  onRewrite,
}: {
  open: boolean;
  label: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRewrite: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (open) setInstruction("");
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rewrite {label}</DialogTitle>
          <DialogDescription>
            The AI rewrites only this section, using your profile and this job
            as the source of facts. The rest of the CV stays unchanged. You can
            undo the replacement afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="cv-rewrite-instruction">
            Guidance for the rewrite (optional)
          </Label>
          <Textarea
            id="cv-rewrite-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={busy}
            placeholder="e.g. make it shorter, lead with the accessibility work, sound more senior…"
            className="min-h-[90px] bg-field"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {busy ? "Stop" : "Cancel"}
          </Button>
          <Button onClick={() => onRewrite(instruction)} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {busy ? "Rewriting…" : "Rewrite section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
