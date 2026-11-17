import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type {
  CvGroundingCategory,
  CvGroundingReport,
} from "@/utils/cvGrounding";
import { Card, CardContent } from "@/components/ui/card";

const GROUPS: {
  category: CvGroundingCategory;
  label: string;
}[] = [
  { category: "skill", label: "Unsupported skills" },
  { category: "education", label: "Education details" },
  { category: "claim", label: "Low-evidence claims" },
  { category: "number", label: "Numbers to verify" },
];

export default function CvGroundingPanel({
  report,
}: {
  report: CvGroundingReport;
}) {
  return (
    <Card className="border-border bg-surface">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            Grounding review
          </h3>
          <span className="font-mono text-[11px] text-text-secondary">
            {report.warnings.length}
          </span>
        </div>
        <p className="text-[11px] text-text-muted">
          A deterministic check against your profile and extra context. It flags
          items to verify; it does not remove or rewrite them.
        </p>

        {report.warnings.length === 0 ? (
          <div className="flex items-start gap-1.5 rounded-md border border-green-700/30 bg-green-500/10 p-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400" />
            <p className="text-[11px] text-green-800 dark:text-green-300">
              No ungrounded skills, education details, claims or numbers were
              detected. This is a useful check, not a guarantee.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {GROUPS.map((group) => {
              const items = report.warnings.filter(
                (warning) => warning.category === group.category,
              );
              if (items.length === 0) return null;
              return (
                <div key={group.category}>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                    {group.label} ({items.length})
                  </p>
                  <ul className="mt-1 space-y-1">
                    {items.map((warning) => (
                      <li
                        key={warning.id}
                        className="flex items-start gap-1.5 text-[10px] text-amber-800 dark:text-amber-300"
                      >
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>{warning.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="border-t border-border pt-2 text-[10px] text-text-muted">
              Remove unsupported skills, add a true profile detail, or edit the
              claim before exporting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
