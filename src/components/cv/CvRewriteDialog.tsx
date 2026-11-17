import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { diffWords } from "@/utils/diff";
import type { CvRewriteProposal } from "@/utils/cvRewrite";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function CvRewriteDialog({
  open,
  label,
  busy,
  error,
  proposal,
  onClose,
  onRewrite,
  onAccept,
  onTryAgain,
}: {
  open: boolean;
  label: string;
  busy: boolean;
  error: string | null;
  proposal: CvRewriteProposal | null;
  onClose: () => void;
  onRewrite: (instruction: string) => void;
  onAccept: () => void;
  onTryAgain: () => void;
}) {
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    if (open) setInstruction("");
  }, [open]);

  const diff = useMemo(
    () =>
      proposal ? diffWords(proposal.currentText, proposal.proposedText) : null,
    [proposal],
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {proposal ? `Review ${label}` : `Rewrite ${label}`}
          </DialogTitle>
          <DialogDescription>
            {proposal
              ? "Check the proposed change before replacing this section. Nothing is applied until you accept, and you can undo the replacement afterwards."
              : "The AI rewrites only this section, using your profile and this job as the source of facts. The rest of the CV stays unchanged."}
          </DialogDescription>
        </DialogHeader>

        {proposal && diff ? (
          <>
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span className="text-green-700 dark:text-green-400">
                +{diff.added} added
              </span>
              <span className="text-destructive">−{diff.removed} removed</span>
              {proposal.usage && (
                <span className="ml-auto font-mono">
                  {formatCvUsage(proposal.usage)}
                </span>
              )}
            </div>
            <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-field/50 p-3 text-xs leading-relaxed">
              {diff.segments.map((segment, index) => (
                <span
                  key={`${segment.type}-${index}`}
                  className={cn(
                    segment.type === "same" && "text-text-secondary",
                    segment.type === "add" &&
                      "rounded-sm bg-green-500/15 text-green-800 dark:text-green-300",
                    segment.type === "remove" &&
                      "rounded-sm bg-destructive/10 text-destructive line-through",
                  )}
                >
                  {segment.text}
                </span>
              ))}
            </div>
            {proposal.warnings.length > 0 && (
              <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-2">
                <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  Numbers to verify before accepting
                </p>
                <ul className="mt-1 space-y-1">
                  {proposal.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="text-[11px] text-amber-800 dark:text-amber-300"
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Discard
              </Button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={onTryAgain} disabled={busy}>
                  <RotateCcw className="size-4" /> Try again
                </Button>
                <Button onClick={onAccept} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Accept rewrite
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
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
              <Button variant="outline" onClick={onClose}>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
