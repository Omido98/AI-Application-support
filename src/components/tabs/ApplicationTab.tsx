import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  MessageSquare,
  ExternalLink,
  Archive,
  Download,
} from "lucide-react";
import { openExternalUrl } from "@/utils/links";
import { exportApplicationsCsv } from "@/utils/csv";
import { useApplicationStore } from "@/stores/applicationStore";
import { useChatStore } from "@/stores/chatStore";
import {
  useAppStore,
  type ApplicationSortMode,
} from "@/stores/useAppStore";
import type {
  ApplicationPriority,
  ApplicationStatus,
  JobApplication,
  WorkMode,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_BADGE_CLASSES,
  ARCHIVED_STATUSES,
  isArchivedStatus,
  sortApplications,
} from "@/utils/applicationStatus";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FitMatrixCard from "@/components/tracker/FitMatrixCard";

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium border shrink-0",
        STATUS_BADGE_CLASSES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function openInBrowser(url: string) {
  openExternalUrl(url);
}

function parseDateOnly(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** Whole days from today to the given date; negative means overdue. */
function daysUntil(value: string): number | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

interface DueChip {
  text: string;
  className: string;
}

/** A chip only when a deadline/follow-up is near, today, or overdue. */
function dueChip(
  value: string,
  noun: "Deadline" | "Follow-up",
): DueChip | null {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days < 0) {
    return {
      text: `${noun} ${Math.abs(days)}d overdue`,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }
  if (days === 0) {
    return {
      text: `${noun} today`,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    };
  }
  if (days <= 7) {
    return {
      text: `${noun} in ${days}d`,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    };
  }
  return null;
}

function PriorityBadge({ priority }: { priority: ApplicationPriority }) {
  if (priority === "medium") return null;
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-medium",
        priority === "high"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
          : "border-border bg-field text-text-secondary",
      )}
    >
      {priority === "high" ? "High priority" : "Low priority"}
    </span>
  );
}

const fieldClass =
  "bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30";

/**
 * Tags edit as a comma-separated draft and commit on blur/Enter, so typing a
 * trailing comma does not get erased mid-keystroke by the normalized store.
 */
function TagsEditor({
  id,
  tags,
  onChange,
}: {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState(tags.join(", "));
  const commit = () => {
    const parsed = [
      ...new Set(
        draft
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    onChange(parsed);
    setDraft(parsed.join(", "));
  };
  return (
    <Input
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder="e.g. remote, fintech, referral"
      aria-describedby="app-tags-help"
      className={fieldClass}
    />
  );
}

/** Statuses that appear in the active (non-archive) list. */
const ACTIVE_STATUSES = STATUS_ORDER.filter(
  (status) => !isArchivedStatus(status),
);

export default function ApplicationTab() {
  const isLoaded = useApplicationStore((s) => s.isLoaded);
  const loadApplications = useApplicationStore((s) => s.loadApplications);

  const applications = useApplicationStore((s) => s.applications);
  const selectedId = useApplicationStore((s) => s.selectedApplicationId);
  const addApplication = useApplicationStore((s) => s.addApplication);
  const removeApplication = useApplicationStore((s) => s.removeApplication);
  const restoreApplication = useApplicationStore((s) => s.restoreApplication);
  const deleteApplicationThread = useApplicationStore(
    (s) => s.deleteApplicationThread,
  );
  const updateApplication = useApplicationStore((s) => s.updateApplication);
  const selectApplication = useApplicationStore((s) => s.selectApplication);

  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const filter = useAppStore((s) => s.applicationFilter);
  const setFilter = useAppStore((s) => s.setApplicationFilter);
  const statusFilter = useAppStore((s) => s.applicationStatusFilter);
  const setStatusFilter = useAppStore((s) => s.setApplicationStatusFilter);
  const viewMode = useAppStore((s) => s.applicationViewMode);
  const setViewMode = useAppStore((s) => s.setApplicationViewMode);
  const sortMode = useAppStore((s) => s.applicationSortMode);
  const setSortMode = useAppStore((s) => s.setApplicationSortMode);
  const resetFilters = useAppStore((s) => s.resetApplicationFilters);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [deletedApp, setDeletedApp] = useState<JobApplication | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedAppRef = useRef<JobApplication | null>(null);
  deletedAppRef.current = deletedApp;

  const finalizeDeletion = (app: JobApplication) => {
    useChatStore.getState().discardDraft(app.id);
    void deleteApplicationThread(app.id);
  };

  const handleDelete = () => {
    if (!pendingDeleteId) return;
    // A new deletion ends the previous undo window immediately.
    if (deletedAppRef.current) finalizeDeletion(deletedAppRef.current);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    const removed = removeApplication(pendingDeleteId);
    setPendingDeleteId(null);
    if (!removed) return;
    setDeletedApp(removed);
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null;
      finalizeDeletion(removed);
      setDeletedApp(null);
    }, 8000);
  };

  const handleUndoDelete = () => {
    const app = deletedAppRef.current;
    if (!app) return;
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    restoreApplication(app);
    setDeletedApp(null);
  };

  // Leaving the tab ends the undo window; never leave an orphaned chat file.
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      const app = deletedAppRef.current;
      if (app) {
        useChatStore.getState().discardDraft(app.id);
        void useApplicationStore.getState().deleteApplicationThread(app.id);
      }
    },
    [],
  );

  const handleExportCsv = async () => {
    setExportStatus(null);
    try {
      const path = await exportApplicationsCsv(applications);
      if (path) {
        const fileName = path.split(/[\\/]/).pop() ?? path;
        setExportStatus(`Exported ${fileName}.`);
      }
    } catch (err) {
      setExportStatus(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  useEffect(() => {
    if (!isLoaded) loadApplications();
  }, [isLoaded, loadApplications]);

  /**
   * A brand-new application starts empty in the Wishlist column. If a search,
   * status filter or the archive view is active it would be invisible, so
   * clear those first and put the user on the new row.
   */
  const handleCreate = () => {
    resetFilters();
    addApplication();
  };

  // Default order is status rank then company; the other modes are explicit
  // user choices and survive tab switches with the filter state.
  const sorted = useMemo(() => {
    const list = [...applications];
    switch (sortMode) {
      case "updated":
        return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      case "company":
        return list.sort(
          (a, b) =>
            a.companyName.localeCompare(b.companyName) ||
            a.jobTitle.localeCompare(b.jobTitle),
        );
      case "deadline":
        return list.sort((a, b) => {
          const ad = a.deadline || "9999-12-31";
          const bd = b.deadline || "9999-12-31";
          return ad.localeCompare(bd);
        });
      default:
        return sortApplications(applications);
    }
  }, [applications, sortMode]);

  const activeApps = useMemo(
    () => sorted.filter((a) => !isArchivedStatus(a.status)),
    [sorted],
  );
  const archiveApps = useMemo(
    () => sorted.filter((a) => isArchivedStatus(a.status)),
    [sorted],
  );

  const visibleApps = viewMode === "active" ? activeApps : archiveApps;
  const visibleStatuses =
    viewMode === "active" ? ACTIVE_STATUSES : ARCHIVED_STATUSES;

  const toggleViewMode = (mode: "active" | "archived") => {
    setViewMode(mode);
    const validForView =
      mode === "active" ? ACTIVE_STATUSES : ARCHIVED_STATUSES;
    if (statusFilter && !validForView.includes(statusFilter)) {
      setStatusFilter(null);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      wishlist: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    };
    for (const app of visibleApps) counts[app.status] += 1;
    return counts;
  }, [visibleApps]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return visibleApps.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!q) return true;
      // Search the whole application, not just company/title, so notes,
      // tags and posting text are findable too.
      const haystack = [
        a.companyName,
        a.jobTitle,
        a.jobDescription,
        a.requirements,
        a.companyResearch,
        a.notes,
        a.location,
        a.workMode,
        a.salary,
        a.source,
        a.contactName,
        a.contactEmail,
        ...a.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleApps, filter, statusFilter]);

  const selected = applications.find((a) => a.id === selectedId) ?? null;
  const selectedDeadline = selected
    ? dueChip(selected.deadline, "Deadline")
    : null;
  const selectedFollowUp = selected
    ? dueChip(selected.followUpAt, "Follow-up")
    : null;
  const pendingDelete = applications.find((a) => a.id === pendingDeleteId) ?? null;

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading applications…</p>
      </div>
    );
  }

  // ── Empty state (no applications at all) ──
  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-text-primary text-lg font-semibold">
          Track your job applications
        </p>
        <p className="text-text-muted text-sm mt-2 max-w-md">
          Add the job you're applying for — the company, the job description,
          and what the application requires. The AI assistant will then help
          you craft your application.
        </p>
        <Button
          className="bg-primary hover:bg-primary/80 text-primary-foreground mt-6"
          onClick={handleCreate}
        >
          <Plus className="size-4 mr-1.5" />
          Add your first application
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-surface/40">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Applications
          </h2>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleCreate}
            title="New application"
            aria-label="New application"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="p-3 pb-1">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              aria-label="Search applications"
              className="bg-field text-text-primary border-border h-8 pl-8 text-xs placeholder:text-text-muted focus-visible:ring-primary/50"
            />
          </div>
        </div>

        <div className="px-3 pb-1.5">
          <Select
            value={sortMode}
            onValueChange={(v) =>
              setSortMode((v ?? "status") as ApplicationSortMode)
            }
          >
            <SelectTrigger
              aria-label="Sort applications"
              className="h-7 w-full border-border bg-field text-[11px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Sort: Status</SelectItem>
              <SelectItem value="updated">Sort: Recently updated</SelectItem>
              <SelectItem value="company">Sort: Company</SelectItem>
              <SelectItem value="deadline">Sort: Deadline</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active / Archive toggle */}
        <div className="px-3 py-1.5">
          <div className="flex rounded-lg bg-border/40 p-0.5 gap-1">
            <button
              type="button"
              onClick={() => toggleViewMode("active")}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors select-none",
                viewMode === "active"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
              aria-pressed={viewMode === "active"}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => toggleViewMode("archived")}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors select-none flex items-center justify-center gap-1",
                viewMode === "archived"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
              aria-pressed={viewMode === "archived"}
            >
              <Archive className="size-3" />
              Archive
              {archiveApps.length > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] leading-4",
                    viewMode === "archived"
                      ? "bg-primary/15 text-primary"
                      : "bg-border/60 text-text-secondary",
                  )}
                >
                  {archiveApps.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div className="px-3 py-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors select-none",
              statusFilter === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface text-text-secondary border-border hover:text-text-primary",
            )}
            aria-pressed={statusFilter === null}
          >
            All ({visibleApps.length})
          </button>
          {visibleStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === status ? null : status)
              }
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors select-none",
                statusFilter === status
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface text-text-secondary border-border hover:text-text-primary",
              )}
              aria-pressed={statusFilter === status}
            >
              {STATUS_LABELS[status]} ({statusCounts[status]})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-text-muted text-center py-4">
              {viewMode === "active"
                ? activeApps.length === 0 && archiveApps.length > 0
                  ? "All applications are archived."
                  : "No applications match."
                : "Nothing archived yet — applications marked Offer or Rejected appear here."}
            </p>
          )}
          {filtered.map((app) => {
            const isSelected = app.id === selectedId;
            const deadline = dueChip(app.deadline, "Deadline");
            const followUp = dueChip(app.followUpAt, "Follow-up");
            const showMeta = app.priority !== "medium" || deadline || followUp;
            return (
              <div
                key={app.id}
                className={cn(
                  "group relative rounded-lg border border-transparent transition-colors",
                  isSelected && "bg-primary/10 border-primary/30",
                )}
              >
                <button
                  onClick={() => selectApplication(app.id)}
                  className="w-full text-left px-3 py-2 pr-8 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {app.companyName.trim() || "Untitled application"}
                    </span>
                    <StatusBadge status={app.status} />
                  </div>
                  {app.jobTitle.trim() && (
                    <p className="text-xs text-text-secondary truncate mt-0.5">
                      {app.jobTitle}
                    </p>
                  )}
                  {showMeta && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <PriorityBadge priority={app.priority} />
                      {deadline && (
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            deadline.className,
                          )}
                        >
                          {deadline.text}
                        </span>
                      )}
                      {followUp && (
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            followUp.className,
                          )}
                        >
                          {followUp.text}
                        </span>
                      )}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(app.id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  title="Delete application"
                  aria-label={`Delete ${app.companyName.trim() || "application"}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Detail pane ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted">
              Select an application from the list.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary">
                {selected.companyName.trim() || "Untitled application"}
              </h1>
              <StatusBadge status={selected.status} />
              <PriorityBadge priority={selected.priority} />
              {selectedDeadline && (
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px]",
                    selectedDeadline.className,
                  )}
                >
                  {selectedDeadline.text}
                </span>
              )}
              {selectedFollowUp && (
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[10px]",
                    selectedFollowUp.className,
                  )}
                >
                  {selectedFollowUp.text}
                </span>
              )}
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportCsv()}
                disabled={applications.length === 0}
              >
                <Download className="size-4 mr-1.5" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("chat")}
              >
                <MessageSquare className="size-4 mr-1.5" />
                Open chat
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPendingDeleteId(selected.id)}
                title="Delete application"
                aria-label="Delete application"
              >
                <Trash2 className="size-4 text-text-secondary" />
              </Button>
            </div>

            {/* Status */}
            {exportStatus && (
              <p className="text-xs text-text-muted">{exportStatus}</p>
            )}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-status"
                  className="text-text-secondary text-sm font-medium"
                >
                  Status
                </Label>
                <Select
                  value={selected.status}
                  onValueChange={(v) => {
                    if (v) {
                      updateApplication(selected.id, {
                        status: v as ApplicationStatus,
                      });
                    }
                  }}
                >
                  <SelectTrigger
                    id="app-status"
                    className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Timeline, priority & history */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="space-y-4 pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-applied-at"
                      className="text-text-secondary text-xs"
                    >
                      Applied on
                    </Label>
                    <Input
                      id="app-applied-at"
                      type="date"
                      value={selected.appliedAt}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          appliedAt: e.target.value,
                        })
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-deadline"
                      className="text-text-secondary text-xs"
                    >
                      Deadline
                    </Label>
                    <Input
                      id="app-deadline"
                      type="date"
                      value={selected.deadline}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          deadline: e.target.value,
                        })
                      }
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-follow-up"
                      className="text-text-secondary text-xs"
                    >
                      Follow-up on
                    </Label>
                    <Input
                      id="app-follow-up"
                      type="date"
                      value={selected.followUpAt}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          followUpAt: e.target.value,
                        })
                      }
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-priority"
                      className="text-text-secondary text-xs"
                    >
                      Priority
                    </Label>
                    <Select
                      value={selected.priority}
                      onValueChange={(v) =>
                        updateApplication(selected.id, {
                          priority: (v ?? "medium") as ApplicationPriority,
                        })
                      }
                    >
                      <SelectTrigger
                        id="app-priority"
                        className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-work-mode"
                      className="text-text-secondary text-xs"
                    >
                      Work mode
                    </Label>
                    <Select
                      value={selected.workMode || "none"}
                      onValueChange={(v) =>
                        updateApplication(selected.id, {
                          workMode:
                            v === "none" || v === null
                              ? ""
                              : (v as WorkMode),
                        })
                      }
                    >
                      <SelectTrigger
                        id="app-work-mode"
                        className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9"
                      >
                        <SelectValue>
                          {(v) =>
                            v === "onsite"
                              ? "On-site"
                              : v === "hybrid"
                                ? "Hybrid"
                                : v === "remote"
                                  ? "Remote"
                                  : "Not set"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selected.statusHistory.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      Status history
                    </p>
                    <ol className="mt-1 space-y-1">
                      {selected.statusHistory.slice(-6).map((entry) => (
                        <li
                          key={`${entry.at}-${entry.status}`}
                          className="flex items-center justify-between gap-2 text-[11px] text-text-secondary"
                        >
                          <span>{STATUS_LABELS[entry.status]}</span>
                          <time
                            dateTime={entry.at}
                            className="font-mono text-[10px] text-text-muted"
                          >
                            {formatHistoryDate(entry.at)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Role details & contact */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="space-y-3 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-location"
                      className="text-text-secondary text-xs"
                    >
                      Location
                    </Label>
                    <Input
                      id="app-location"
                      value={selected.location}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          location: e.target.value,
                        })
                      }
                      placeholder="e.g. Copenhagen, Denmark"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-salary"
                      className="text-text-secondary text-xs"
                    >
                      Salary
                    </Label>
                    <Input
                      id="app-salary"
                      value={selected.salary}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          salary: e.target.value,
                        })
                      }
                      placeholder="e.g. EUR 65–80k"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-source"
                      className="text-text-secondary text-xs"
                    >
                      Source
                    </Label>
                    <Input
                      id="app-source"
                      value={selected.source}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          source: e.target.value,
                        })
                      }
                      placeholder="e.g. LinkedIn, referral, company site"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="app-contact-name"
                      className="text-text-secondary text-xs"
                    >
                      Contact name
                    </Label>
                    <Input
                      id="app-contact-name"
                      value={selected.contactName}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          contactName: e.target.value,
                        })
                      }
                      placeholder="e.g. Hiring manager"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="app-contact-email"
                      className="text-text-secondary text-xs"
                    >
                      Contact email
                    </Label>
                    <Input
                      id="app-contact-email"
                      type="email"
                      value={selected.contactEmail}
                      onChange={(e) =>
                        updateApplication(selected.id, {
                          contactEmail: e.target.value,
                        })
                      }
                      placeholder="e.g. careers@example.com"
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="app-tags"
                      className="text-text-secondary text-xs"
                    >
                      Tags
                    </Label>
                    <TagsEditor
                      key={selected.id}
                      id="app-tags"
                      tags={selected.tags}
                      onChange={(tags) =>
                        updateApplication(selected.id, { tags })
                      }
                    />
                    <p
                      id="app-tags-help"
                      className="text-[11px] text-text-muted"
                    >
                      Comma-separated. Search matches tags too.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <FitMatrixCard
              application={selected}
              onOpenChat={() => setActiveTab("chat")}
            />

            {/* Company Name */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-company"
                  className="text-text-secondary text-sm font-medium"
                >
                  Company Name
                </Label>
                <Input
                  id="app-company"
                  value={selected.companyName}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      companyName: e.target.value,
                    })
                  }
                  placeholder="e.g., Acme Corp"
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Job Title */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-job-title"
                  className="text-text-secondary text-sm font-medium"
                >
                  Job Title
                </Label>
                <Input
                  id="app-job-title"
                  value={selected.jobTitle}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      jobTitle: e.target.value,
                    })
                  }
                  placeholder="e.g., Senior Frontend Developer"
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Application URL */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-url"
                  className="text-text-secondary text-sm font-medium"
                >
                  Application URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="app-url"
                    value={selected.applicationUrl}
                    onChange={(e) =>
                      updateApplication(selected.id, {
                        applicationUrl: e.target.value,
                      })
                    }
                    placeholder="https://…"
                    className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
                  />
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    title="Open in browser"
                    aria-label="Open application URL in browser"
                    disabled={!selected.applicationUrl.trim()}
                    onClick={() => void openInBrowser(selected.applicationUrl.trim())}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Job Description */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-description"
                  className="text-text-secondary text-sm font-medium"
                >
                  Job Description
                </Label>
                <Textarea
                  id="app-description"
                  value={selected.jobDescription}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      jobDescription: e.target.value,
                    })
                  }
                  placeholder="Paste the full job description here..."
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[200px] transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Application Language */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-language"
                  className="text-text-secondary text-sm font-medium"
                >
                  Application Language
                </Label>
                <Input
                  id="app-language"
                  value={selected.applicationLanguage}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      applicationLanguage: e.target.value,
                    })
                  }
                  placeholder="e.g., English, Danish"
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Requirements */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-requirements"
                  className="text-text-secondary text-sm font-medium"
                >
                  What does the application require?
                </Label>
                <Textarea
                  id="app-requirements"
                  value={selected.requirements}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      requirements: e.target.value,
                    })
                  }
                  placeholder="e.g., Cover letter, Answer to 3 specific questions..."
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[150px] transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Company Research (optional) */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-research"
                  className="text-text-secondary text-sm font-medium"
                >
                  Company Research (optional)
                </Label>
                <Textarea
                  id="app-research"
                  value={selected.companyResearch}
                  onChange={(e) =>
                    updateApplication(selected.id, {
                      companyResearch: e.target.value,
                    })
                  }
                  placeholder="Paste any information you have about the company — website content, news articles, annual reports, etc. The AI will use this context to tailor your application."
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[150px] transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>

            {/* Notes */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label
                  htmlFor="app-notes"
                  className="text-text-secondary text-sm font-medium"
                >
                  Notes
                </Label>
                <Textarea
                  id="app-notes"
                  value={selected.notes}
                  onChange={(e) =>
                    updateApplication(selected.id, { notes: e.target.value })
                  }
                  placeholder="Deadlines, contacts, follow-ups…"
                  className="bg-field text-text-primary border-border focus-visible:ring-primary/50 min-h-[100px] transition-[border-color,box-shadow] hover:border-primary/30"
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete application?</DialogTitle>
            <DialogDescription>
              This will delete{" "}
              <span className="text-text-primary font-medium">
                {pendingDelete?.companyName.trim() || "this application"}
              </span>{" "}
              and its entire chat history. You can undo for 8 seconds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deletedApp && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 shadow-lg"
        >
          <span className="text-sm text-text-primary">
            Deleted {deletedApp.companyName.trim() || "application"}
          </span>
          <Button size="sm" variant="outline" onClick={handleUndoDelete}>
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}
