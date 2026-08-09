import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  MessageSquare,
  ExternalLink,
  Archive,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useApplicationStore } from "@/stores/applicationStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ApplicationStatus } from "@/types";
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

async function openInBrowser(url: string) {
  try {
    await openUrl(url);
  } catch {
    // Not running inside Tauri — fall back to a plain browser tab.
    window.open(url, "_blank", "noopener,noreferrer");
  }
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
  const updateApplication = useApplicationStore((s) => s.updateApplication);
  const selectApplication = useApplicationStore((s) => s.selectApplication);

  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  useEffect(() => {
    if (!isLoaded) loadApplications();
  }, [isLoaded, loadApplications]);

  // Sort by status rank (Wishlist first, Rejected last), then alphabetically
  // by company within each status group.
  const sorted = useMemo(() => sortApplications(applications), [applications]);

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
      return (
        a.companyName.toLowerCase().includes(q) ||
        a.jobTitle.toLowerCase().includes(q)
      );
    });
  }, [visibleApps, filter, statusFilter]);

  const selected = applications.find((a) => a.id === selectedId) ?? null;
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
          onClick={() => addApplication()}
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
            onClick={() => addApplication()}
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
              <div className="flex-1" />
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
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label className="text-text-secondary text-sm font-medium">
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
                  <SelectTrigger className="w-full bg-field border-border focus-visible:ring-primary/50 data-[size=default]:h-9">
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

            {/* Company Name */}
            <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
              <CardContent className="pt-4 space-y-2">
                <Label className="text-text-secondary text-sm font-medium">
                  Company Name
                </Label>
                <Input
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
                <Label className="text-text-secondary text-sm font-medium">
                  Job Title
                </Label>
                <Input
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
                <Label className="text-text-secondary text-sm font-medium">
                  Application URL
                </Label>
                <div className="flex gap-2">
                  <Input
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
                <Label className="text-text-secondary text-sm font-medium">
                  Job Description
                </Label>
                <Textarea
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
                <Label className="text-text-secondary text-sm font-medium">
                  Application Language
                </Label>
                <Input
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
                <Label className="text-text-secondary text-sm font-medium">
                  What does the application require?
                </Label>
                <Textarea
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
                <Label className="text-text-secondary text-sm font-medium">
                  Company Research (optional)
                </Label>
                <Textarea
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
                <Label className="text-text-secondary text-sm font-medium">
                  Notes
                </Label>
                <Textarea
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
              This will permanently delete{" "}
              <span className="text-text-primary font-medium">
                {pendingDelete?.companyName.trim() || "this application"}
              </span>{" "}
              and its entire chat history. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) void removeApplication(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
