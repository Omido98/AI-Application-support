import { useSyncExternalStore } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearStorageIssues,
  dismissStorageIssue,
  getStorageIssues,
  subscribeStorageIssues,
  type StorageIssue,
} from "@/utils/storage";

function issueTitle(issue: StorageIssue): string {
  switch (issue.kind) {
    case "save":
      return "Your latest change could not be saved";
    case "load":
      return "Some of your data could not be loaded";
    case "delete":
      return "A data file could not be deleted";
    case "recovery":
      return "Your data was recovered from a backup";
  }
}

/**
 * A single, dismissible banner for persistence problems. Storage failures are
 * never silent: losing data without telling the user is the one thing this app
 * must not do.
 */
export default function StorageAlert() {
  const issues = useSyncExternalStore(
    subscribeStorageIssues,
    getStorageIssues,
    getStorageIssues,
  );
  if (issues.length === 0) return null;

  const latest = issues[issues.length - 1];
  const isError = latest.kind !== "recovery";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "mx-auto mt-2 w-[min(92vw,680px)] shrink-0 rounded-lg border p-3 shadow-sm",
        isError
          ? "border-destructive/40 bg-surface text-text-primary"
          : "border-amber-500/40 bg-surface text-text-primary",
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className={cn(
            "mt-0.5 size-4 shrink-0",
            isError ? "text-destructive" : "text-amber-400",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{issueTitle(latest)}</p>
          <p className="mt-0.5 break-words text-xs text-text-secondary">
            {latest.message}
          </p>
          <p className="mt-1 font-mono text-[10px] text-text-muted">
            {latest.file}
            {issues.length > 1
              ? ` · ${issues.length - 1} earlier issue(s)`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {issues.length > 1 && (
            <button
              type="button"
              onClick={clearStorageIssues}
              className="rounded px-1.5 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
            >
              Dismiss all
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissStorageIssue(latest.id)}
            className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label="Dismiss storage warning"
            title="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
