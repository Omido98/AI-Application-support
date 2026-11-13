import { useMemo } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { buildFitMatrix, type FitLevel } from "@/utils/fitMatrix";
import type { JobApplication } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LEVEL_STYLES: Record<FitLevel, string> = {
  strong: "border-primary/30 bg-primary/10 text-primary",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  gap: "border-destructive/30 bg-destructive/10 text-destructive",
};

const LEVEL_LABELS: Record<FitLevel, string> = {
  strong: "Strong",
  partial: "Partial",
  gap: "Gap",
};

export default function FitMatrixCard({
  application,
  onOpenChat,
}: {
  application: JobApplication;
  onOpenChat: () => void;
}) {
  const skills = useProfileStore((s) => s.skills);
  const workExperience = useProfileStore((s) => s.workExperience);
  const education = useProfileStore((s) => s.education);
  const languages = useProfileStore((s) => s.languages);
  const certifications = useProfileStore((s) => s.certifications);
  const otherEngagements = useProfileStore((s) => s.otherEngagements);

  const matrix = useMemo(
    () =>
      buildFitMatrix(application, {
        skills,
        workExperience,
        education,
        languages,
        certifications,
        otherEngagements,
      }),
    [
      application,
      skills,
      workExperience,
      education,
      languages,
      certifications,
      otherEngagements,
    ],
  );

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-text-primary text-lg">
            Fit matrix
          </CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Requirement lines matched against your profile. Use chat for the
            nuanced evaluation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenChat}>
          Ask the assistant
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {matrix.rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            Add the job requirements or description to see a fit breakdown.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span
                className={cn(
                  "rounded border px-2 py-0.5",
                  LEVEL_STYLES.strong,
                )}
              >
                {matrix.strong} strong
              </span>
              <span
                className={cn(
                  "rounded border px-2 py-0.5",
                  LEVEL_STYLES.partial,
                )}
              >
                {matrix.partial} partial
              </span>
              <span
                className={cn("rounded border px-2 py-0.5", LEVEL_STYLES.gap)}
              >
                {matrix.gap} gap
              </span>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {matrix.rows.map((row) => (
                <li key={row.requirement} className="space-y-1 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-text-primary">
                      {row.requirement}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                        LEVEL_STYLES[row.level],
                      )}
                    >
                      {LEVEL_LABELS[row.level]}
                    </span>
                  </div>
                  {row.evidence.length > 0 && (
                    <ul className="space-y-0.5">
                      {row.evidence.map((item) => (
                        <li
                          key={item}
                          className="truncate text-[11px] text-text-muted"
                          title={item}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
