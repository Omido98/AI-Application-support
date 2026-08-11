import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { WorkExperience } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDeleteDialog, {
  truncateLabel,
  type DeleteTarget,
} from "@/components/profile/ConfirmDeleteDialog";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = Array.from({ length: 31 }, (_, i) => String(2000 + i));

function createEmptyWorkExperience(): WorkExperience {
  return {
    id: crypto.randomUUID(),
    company: "",
    role: "",
    startMonth: "January",
    startYear: "2024",
    isCurrent: false,
    endMonth: "June",
    endYear: "2024",
    jobDescription: "",
    projects: [],
  };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";
const selectClass =
  "bg-field border border-border text-text-primary rounded-md px-3 py-1.5 text-sm appearance-none cursor-pointer transition-[border-color,box-shadow] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";
const textareaClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[100px] max-h-[200px] transition-[border-color,box-shadow] hover:border-primary/30";

/** An entry carrying no user content is deleted without confirmation. */
function isWorkExperienceEmpty(w: WorkExperience): boolean {
  return (
    !w.company.trim() &&
    !w.role.trim() &&
    !w.jobDescription.trim() &&
    w.projects.every((p) => !p.trim())
  );
}

export default function WorkExperienceSection() {
  const workExperience = useProfileStore((s) => s.workExperience);
  const addWorkExperience = useProfileStore((s) => s.addWorkExperience);
  const updateWorkExperience = useProfileStore((s) => s.updateWorkExperience);
  const removeWorkExperience = useProfileStore((s) => s.removeWorkExperience);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // New entry — start expanded
  const handleAdd = () => {
    const we = createEmptyWorkExperience();
    addWorkExperience(we);
    setExpanded((prev) => ({ ...prev, [we.id]: true }));
  };

  const requestDeleteEntry = (we: WorkExperience) => {
    if (isWorkExperienceEmpty(we)) {
      removeWorkExperience(we.id);
      return;
    }
    const title = [we.role, we.company].filter(Boolean).join(" @ ");
    setDeleteTarget({
      label: title ? `the work experience entry "${title}"` : "this work experience entry",
      onConfirm: () => removeWorkExperience(we.id),
    });
  };

  const requestDeleteProject = (we: WorkExperience, projectIndex: number) => {
    const project = we.projects[projectIndex];
    if (!project.trim()) {
      const next = we.projects.filter((_, i) => i !== projectIndex);
      updateWorkExperience(we.id, { projects: next });
      return;
    }
    setDeleteTarget({
      label: `the project "${truncateLabel(project)}"`,
      onConfirm: () => {
        const next = we.projects.filter((_, i) => i !== projectIndex);
        updateWorkExperience(we.id, { projects: next });
      },
    });
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Work Experience</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Work Experience
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {workExperience.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No work experience entries yet. Click "Add Work Experience" to get started.
          </p>
        )}

        {workExperience.map((we) => {
          const isExpanded = expanded[we.id] ?? false;
          const title = [we.role, we.company].filter(Boolean).join(" @ ");
          const dateRange = `${we.startMonth} ${we.startYear} – ${
            we.isCurrent ? "Present" : `${we.endMonth ?? ""} ${we.endYear ?? ""}`
          }`;

          return (
            <Card
              key={we.id}
              className="bg-field border-border relative overflow-visible transition-[border-color] hover:border-primary/20"
            >
              {isExpanded && (
                <button
                  type="button"
                  onClick={() => requestDeleteEntry(we)}
                  className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
                  title="Remove entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              <CardContent className={isExpanded ? "pt-6 pb-4" : "pt-3 pb-2"}>
                {!isExpanded ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(we.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(we.id);
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
                    title="Expand entry"
                  >
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-medium truncate ${
                          title ? "text-text-primary" : "text-text-muted italic"
                        }`}
                      >
                        {title || "Untitled entry"}
                      </span>
                      <span className="block text-xs text-text-secondary truncate">
                        {dateRange}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <ChevronDown className="h-4 w-4 text-text-muted" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteEntry(we);
                        }}
                        className="text-destructive hover:text-red-400 transition-colors"
                        title="Remove entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Company + Role side by side */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">Company</Label>
                        <Input
                          className={inputClass}
                          value={we.company}
                          onChange={(e) =>
                            updateWorkExperience(we.id, { company: e.target.value })
                          }
                          placeholder="e.g. Acme Corp"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">Role</Label>
                        <Input
                          className={inputClass}
                          value={we.role}
                          onChange={(e) =>
                            updateWorkExperience(we.id, { role: e.target.value })
                          }
                          placeholder="e.g. Software Engineer"
                        />
                      </div>
                    </div>

                    {/* Start Date */}
                    <div className="grid gap-1.5">
                      <Label className="text-text-secondary text-xs">Start Date</Label>
                      <div className="flex gap-2">
                        <select
                          className={selectClass}
                          value={we.startMonth}
                          onChange={(e) =>
                            updateWorkExperience(we.id, { startMonth: e.target.value })
                          }
                        >
                          {MONTHS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          className={selectClass}
                          value={we.startYear}
                          onChange={(e) =>
                            updateWorkExperience(we.id, { startYear: e.target.value })
                          }
                        >
                          {YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Current occupation checkbox */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`current-${we.id}`}
                        checked={we.isCurrent}
                        onCheckedChange={(checked) =>
                          updateWorkExperience(we.id, {
                            isCurrent: checked === true,
                            endMonth: checked === true ? undefined : we.endMonth,
                            endYear: checked === true ? undefined : we.endYear,
                          })
                        }
                      />
                      <Label
                        htmlFor={`current-${we.id}`}
                        className="text-text-secondary text-sm cursor-pointer"
                      >
                        This is my current occupation
                      </Label>
                    </div>

                    {/* End Date — hidden when current */}
                    {!we.isCurrent && (
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">End Date</Label>
                        <div className="flex gap-2">
                          <select
                            className={selectClass}
                            value={we.endMonth ?? "June"}
                            onChange={(e) =>
                              updateWorkExperience(we.id, { endMonth: e.target.value })
                            }
                          >
                            {MONTHS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <select
                            className={selectClass}
                            value={we.endYear ?? "2024"}
                            onChange={(e) =>
                              updateWorkExperience(we.id, { endYear: e.target.value })
                            }
                          >
                            {YEARS.map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Job Description */}
                    <div className="grid gap-1.5">
                      <Label className="text-text-secondary text-xs">Job Description</Label>
                      <Textarea
                        className={textareaClass}
                        value={we.jobDescription}
                        onChange={(e) =>
                          updateWorkExperience(we.id, {
                            jobDescription: e.target.value,
                          })
                        }
                        placeholder="Describe your responsibilities and achievements…"
                      />
                    </div>

                    {/* Projects */}
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-text-secondary text-xs">
                          Projects / Initiatives
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary/80 h-6 px-2 text-xs"
                          onClick={() =>
                            updateWorkExperience(we.id, {
                              projects: [...we.projects, ""],
                            })
                          }
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Project/Initiative
                        </Button>
                      </div>
                      {we.projects.map((proj, pi) => (
                        <div key={pi} className="flex items-start gap-2">
                          <Textarea
                            className={textareaClass + " flex-1 resize-y"}
                            value={proj}
                            onChange={(e) => {
                              const next = [...we.projects];
                              next[pi] = e.target.value;
                              updateWorkExperience(we.id, { projects: next });
                            }}
                            placeholder="Describe the project / initiative — add as much detail as you like…"
                          />
                          <button
                            type="button"
                            onClick={() => requestDeleteProject(we, pi)}
                            className="text-destructive hover:text-red-400 transition-colors shrink-0 mt-2"
                            title="Remove project"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="link"
                      size="sm"
                      className="text-text-muted hover:text-text-secondary px-0 h-auto mt-1"
                      onClick={() => toggleExpand(we.id)}
                    >
                      Collapse <ChevronUp className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
      <ConfirmDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
