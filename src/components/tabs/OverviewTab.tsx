import { useEffect, useMemo } from "react";
import { Bell, CalendarClock, Clock, Inbox, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApplicationStore } from "@/stores/applicationStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ApplicationStatus } from "@/types";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/utils/applicationStatus";
import {
  UPCOMING_WINDOW_DAYS,
  computePipelineStats,
} from "@/utils/pipelineStats";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Solid segment colours for the CSS-only status and activity bars. */
const STATUS_BAR_CLASSES: Record<ApplicationStatus, string> = {
  wishlist: "bg-text-muted/60",
  applied: "bg-blue-500",
  interview: "bg-amber-500",
  offer: "bg-green-500",
  rejected: "bg-destructive",
};

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
        STATUS_BADGE_CLASSES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatShortDate(value: string): string {
  // `deadline`/`followUpAt` are date-only (YYYY-MM-DD); timestamps carry a
  // time. Parsing date-only as local midnight keeps the calendar day stable
  // in every timezone instead of shifting it with UTC parsing.
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDueDays(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `in ${daysUntil}d`;
}

function dueClass(daysUntil: number): string {
  if (daysUntil < 0) return "text-destructive";
  if (daysUntil <= 1) return "text-amber-500";
  return "text-text-secondary";
}

/** Pipeline analytics: totals, conversion rates, deadlines and activity. */
export default function OverviewTab() {
  const isLoaded = useApplicationStore((s) => s.isLoaded);
  const loadApplications = useApplicationStore((s) => s.loadApplications);
  const applications = useApplicationStore((s) => s.applications);
  const selectApplication = useApplicationStore((s) => s.selectApplication);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  useEffect(() => {
    if (!isLoaded) void loadApplications();
  }, [isLoaded, loadApplications]);

  const stats = useMemo(
    () => computePipelineStats(applications),
    [applications],
  );

  const openApplication = (applicationId: string) => {
    selectApplication(applicationId);
    setActiveTab("application");
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-text-muted">Loading pipeline…</p>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Inbox className="size-8 text-text-muted" aria-hidden="true" />
        <p className="mt-3 text-lg font-semibold text-text-primary">
          No pipeline data yet
        </p>
        <p className="mt-2 max-w-md text-sm text-text-muted">
          Add your first application to see response rates, upcoming deadlines
          and monthly activity here.
        </p>
        <Button className="mt-6" onClick={() => setActiveTab("application")}>
          Go to applications
        </Button>
      </div>
    );
  }

  const {
    totals,
    rates,
    statusCounts,
    upcoming,
    monthlyApplications,
    recentStatusChanges,
  } = stats;

  const summaryCards = [
    { label: "Total", value: totals.total },
    { label: "Active", value: totals.active },
    { label: "Applied", value: totals.applied },
    { label: "Interviews", value: totals.interviews },
    { label: "Offers", value: totals.offers },
    { label: "Rejected", value: totals.rejected },
  ];

  const rateCards = [
    {
      label: "Response",
      value: rates.responseRate,
      hint: "Interview, offer or rejection",
    },
    {
      label: "Interview",
      value: rates.interviewRate,
      hint: "Interview or offer",
    },
    {
      label: "Offer",
      value: rates.offerRate,
      hint: "Offer received",
    },
  ];

  const maxMonthly = Math.max(
    ...monthlyApplications.map((month) => month.count),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Overview</h1>
        <p className="mt-1 text-sm text-text-muted">
          Pipeline health at a glance — conversions, deadlines and monthly
          activity.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className="bg-surface border-border">
            <CardContent>
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {card.label}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text-primary">
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conversion rates */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp
                className="size-4 text-primary"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-text-primary">
                Conversion rates
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {rateCards.map((rate) => (
                <div key={rate.label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-text-secondary">
                      {rate.label}
                    </span>
                    <span className="font-mono text-lg font-semibold text-text-primary">
                      {formatRate(rate.value)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-border/60"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(rate.value * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-text-muted">{rate.hint}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-border pt-2 text-[10px] text-text-muted">
              Rates use applications that moved past the wishlist; a rejection
              counts as a response.
            </p>
          </CardContent>
        </Card>

        {/* Status distribution */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Status distribution
              </h2>
              <span className="font-mono text-[10px] text-text-muted">
                {totals.total} total
              </span>
            </div>
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-border/40"
              role="img"
              aria-label={STATUS_ORDER.map(
                (status) => `${STATUS_LABELS[status]}: ${statusCounts[status]}`,
              ).join(", ")}
            >
              {STATUS_ORDER.map((status) => {
                const count = statusCounts[status];
                if (count === 0) return null;
                return (
                  <div
                    key={status}
                    className={cn("h-full", STATUS_BAR_CLASSES[status])}
                    style={{ width: `${(count / totals.total) * 100}%` }}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {STATUS_ORDER.map((status) => (
                <div
                  key={status}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      STATUS_BAR_CLASSES[status],
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate text-text-secondary">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="ml-auto font-mono text-text-primary">
                    {statusCounts[status]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming deadlines and follow-ups */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Upcoming
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-text-muted">
                Next {UPCOMING_WINDOW_DAYS} days
              </span>
            </div>
            {upcoming.length === 0 ? (
              <p className="py-8 text-center text-xs text-text-muted">
                Nothing due in the next {UPCOMING_WINDOW_DAYS} days.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {upcoming.map((item) => {
                  const Icon = item.kind === "deadline" ? CalendarClock : Bell;
                  return (
                    <li key={`${item.applicationId}-${item.kind}`}>
                      <button
                        type="button"
                        onClick={() => openApplication(item.applicationId)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon
                          className="size-3.5 shrink-0 text-text-muted"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-text-primary">
                            {item.companyName.trim() || "Untitled application"}
                          </span>
                          <span className="block text-[10px] text-text-muted">
                            {item.kind === "deadline" ? "Deadline" : "Follow-up"}{" "}
                            · {formatShortDate(item.date)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10px]",
                            dueClass(item.daysUntil),
                          )}
                        >
                          {formatDueDays(item.daysUntil)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Six-month activity */}
        <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Activity
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-text-muted">
                Last 6 months
              </span>
            </div>
            <div
              className="flex items-end gap-2"
              role="img"
              aria-label={`Applications created per month: ${monthlyApplications
                .map((month) => `${month.label} ${month.count}`)
                .join(", ")}`}
            >
              {monthlyApplications.map((month) => {
                const percent =
                  maxMonthly === 0
                    ? 0
                    : Math.round((month.count / maxMonthly) * 100);
                return (
                  <div
                    key={month.label}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="font-mono text-[10px] text-text-secondary">
                      {month.count}
                    </span>
                    <div className="flex h-24 w-full items-end overflow-hidden rounded-sm bg-field/60">
                      <div
                        className="w-full rounded-t-sm bg-primary/80"
                        style={{
                          height: `${percent}%`,
                          minHeight: month.count > 0 ? 4 : 0,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {month.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent status changes */}
      <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">
              Recent status changes
            </h2>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">
              Latest 10
            </span>
          </div>
          {recentStatusChanges.length === 0 ? (
            <p className="py-8 text-center text-xs text-text-muted">
              No status changes recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {recentStatusChanges.map((change, index) => (
                <li
                  key={`${change.applicationId}-${change.at}-${change.status}-${index}`}
                >
                  <button
                    type="button"
                    onClick={() => openApplication(change.applicationId)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Clock
                      className="size-3.5 shrink-0 text-text-muted"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                      {change.companyName.trim() || "Untitled application"}
                    </span>
                    <StatusBadge status={change.status} />
                    <time
                      dateTime={change.at}
                      className="hidden w-24 shrink-0 text-right font-mono text-[10px] text-text-muted sm:block"
                    >
                      {formatShortDate(change.at)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
