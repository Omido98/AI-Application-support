import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CvConsistencyReport } from "@/utils/cvConsistency";
import { Card, CardContent } from "@/components/ui/card";

export default function CvConsistencyPanel({
  report,
}: {
  report: CvConsistencyReport;
}) {
  return (
    <Card className="bg-surface border-border">
      <CardContent className="space-y-2 pt-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Cover-letter consistency
        </h3>
        <p className="text-[11px] text-text-muted">
          A quick comparison with your saved cover letters. It never edits
          either document.
        </p>
        <ul className="space-y-1.5">
          {report.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-1.5 text-[11px]">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-700 dark:text-green-400" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700 dark:text-amber-400" />
              )}
              <span>
                <span className="text-text-primary">{check.label}</span>
                <span className="block text-text-muted">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
