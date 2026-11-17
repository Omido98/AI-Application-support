import { useMemo } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { CvDocument } from "@/types/cv";
import type { ProfileData } from "@/types";
import { analyzeCvGrounding } from "@/utils/cvGrounding";
import { estimateCvPages } from "@/utils/cvPageEstimate";
import { formatCvUsage } from "@/utils/cvUsage";
import CvGroundingPanel from "@/components/cv/CvGroundingPanel";
import CvProposalDetails from "@/components/cv/CvProposalDetails";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CvGenerationReviewDialog({
  open,
  proposal,
  current,
  profile,
  busy,
  onAccept,
  onDiscard,
}: {
  open: boolean;
  proposal: CvDocument | null;
  current: CvDocument | null;
  profile: ProfileData;
  busy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const grounding = useMemo(
    () => (proposal ? analyzeCvGrounding(proposal, profile) : null),
    [proposal, profile],
  );
  const pages = proposal ? estimateCvPages(proposal).pages : 0;
  const includedRoles =
    proposal?.experience.filter((item) => item.included).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onDiscard()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review generated CV</DialogTitle>
          <DialogDescription>
            Nothing is replaced until you accept. Accepting saves the previous
            draft in Versions and replaces the current CV.
          </DialogDescription>
        </DialogHeader>

        {proposal && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
              <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5">
                <Sparkles className="size-3 text-primary" /> AI draft
              </span>
              <span>
                ~{pages} {pages === 1 ? "page" : "pages"}
              </span>
              <span>
                {includedRoles} {includedRoles === 1 ? "role" : "roles"}
              </span>
              <span>{proposal.skills.length} skills</span>
              {proposal.lastUsage && (
                <span className="font-mono">
                  {formatCvUsage(proposal.lastUsage)}
                </span>
              )}
            </div>

            {(proposal.headline.trim() || proposal.summary.trim()) && (
              <div className="rounded-md border border-border bg-field/40 p-3">
                {proposal.headline.trim() && (
                  <p className="text-sm font-semibold text-text-primary">
                    {proposal.headline.trim()}
                  </p>
                )}
                {proposal.summary.trim() && (
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                    {proposal.summary.trim()}
                  </p>
                )}
              </div>
            )}

            <CvProposalDetails proposal={proposal} />

            {grounding && <CvGroundingPanel report={grounding} />}

            {current && (
              <p className="text-[11px] text-text-muted">
                The current CV will be snapshotted before this draft replaces
                it, so you can restore it from Versions.
              </p>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onDiscard} disabled={busy}>
            Discard
          </Button>
          <Button onClick={onAccept} disabled={!proposal || busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Accept generated CV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
