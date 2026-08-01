import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { WorkExperience } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

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

export default function WorkExperienceSection() {
  const workExperience = useProfileStore((s) => s.workExperience);
  const addWorkExperience = useProfileStore((s) => s.addWorkExperience);
  const updateWorkExperience = useProfileStore((s) => s.updateWorkExperience);
  const removeWorkExperience = useProfileStore((s) => s.removeWorkExperience);

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Work Experience</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addWorkExperience(createEmptyWorkExperience())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Work Experience
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {workExperience.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No work experience entries yet. Click "Add Work Experience" to get started.
          </p>
        )}

        {workExperience.map((we) => (
          <Card
            key={we.id}
            className="bg-field border-border relative overflow-visible transition-[border-color] hover:border-primary/20"
          >
            {/* Trash button */}
            <button
              type="button"
              onClick={() => removeWorkExperience(we.id)}
              className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
              title="Remove entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <CardContent className="pt-6 pb-4 space-y-4">
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
                      onClick={() => {
                        const next = we.projects.filter((_, i) => i !== pi);
                        updateWorkExperience(we.id, { projects: next });
                      }}
                      className="text-destructive hover:text-red-400 transition-colors shrink-0 mt-2"
                      title="Remove project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
