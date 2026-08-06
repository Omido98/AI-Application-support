import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { OtherEngagement } from "@/types";
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

function createEmptyOtherEngagement(): OtherEngagement {
  return {
    id: crypto.randomUUID(),
    organization: "",
    role: "",
    startMonth: "January",
    startYear: "2024",
    isCurrent: false,
    endMonth: "June",
    endYear: "2024",
    description: "",
    achievements: [],
  };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";
const selectClass =
  "bg-field border border-border text-text-primary rounded-md px-3 py-1.5 text-sm appearance-none cursor-pointer transition-[border-color,box-shadow] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";
const textareaClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[100px] max-h-[200px] transition-[border-color,box-shadow] hover:border-primary/30";

export default function OtherEngagementsSection() {
  const otherEngagements = useProfileStore((s) => s.otherEngagements);
  const addOtherEngagement = useProfileStore((s) => s.addOtherEngagement);
  const updateOtherEngagement = useProfileStore((s) => s.updateOtherEngagement);
  const removeOtherEngagement = useProfileStore((s) => s.removeOtherEngagement);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // New entry — start expanded
  const handleAdd = () => {
    const oe = createEmptyOtherEngagement();
    addOtherEngagement(oe);
    setExpanded((prev) => ({ ...prev, [oe.id]: true }));
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Other Engagements</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Other Engagement
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {otherEngagements.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No other engagements yet. Click "Add Other Engagement" to get started.
          </p>
        )}

        {otherEngagements.map((oe) => {
          const isExpanded = expanded[oe.id] ?? false;
          const title = [oe.role, oe.organization].filter(Boolean).join(" @ ");
          const dateRange = `${oe.startMonth} ${oe.startYear} – ${
            oe.isCurrent ? "Present" : `${oe.endMonth ?? ""} ${oe.endYear ?? ""}`
          }`;

          return (
            <Card
              key={oe.id}
              className="bg-field border-border relative overflow-visible transition-[border-color] hover:border-primary/20"
            >
              {/* Trash button */}
              <button
                type="button"
                onClick={() => removeOtherEngagement(oe.id)}
                className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
                title="Remove entry"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <CardContent className="pt-6 pb-4">
                {!isExpanded ? (
                  <div>
                    {title ? (
                      <p className="text-text-primary text-sm font-medium mb-1">
                        {title}
                      </p>
                    ) : (
                      <p className="text-text-muted italic text-sm mb-1">
                        Untitled entry
                      </p>
                    )}
                    <p className="text-text-secondary text-sm">{dateRange}</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-primary px-0 h-auto mt-1"
                      onClick={() => toggleExpand(oe.id)}
                    >
                      Expand <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Organization + Role side by side */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">Organization</Label>
                        <Input
                          className={inputClass}
                          value={oe.organization}
                          onChange={(e) =>
                            updateOtherEngagement(oe.id, { organization: e.target.value })
                          }
                          placeholder="e.g. Red Cross"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">Role</Label>
                        <Input
                          className={inputClass}
                          value={oe.role}
                          onChange={(e) =>
                            updateOtherEngagement(oe.id, { role: e.target.value })
                          }
                          placeholder="e.g. Volunteer Coordinator"
                        />
                      </div>
                    </div>

                    {/* Start Date */}
                    <div className="grid gap-1.5">
                      <Label className="text-text-secondary text-xs">Start Date</Label>
                      <div className="flex gap-2">
                        <select
                          className={selectClass}
                          value={oe.startMonth}
                          onChange={(e) =>
                            updateOtherEngagement(oe.id, { startMonth: e.target.value })
                          }
                        >
                          {MONTHS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          className={selectClass}
                          value={oe.startYear}
                          onChange={(e) =>
                            updateOtherEngagement(oe.id, { startYear: e.target.value })
                          }
                        >
                          {YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Current engagement checkbox */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`current-${oe.id}`}
                        checked={oe.isCurrent}
                        onCheckedChange={(checked) =>
                          updateOtherEngagement(oe.id, {
                            isCurrent: checked === true,
                            endMonth: checked === true ? undefined : oe.endMonth,
                            endYear: checked === true ? undefined : oe.endYear,
                          })
                        }
                      />
                      <Label
                        htmlFor={`current-${oe.id}`}
                        className="text-text-secondary text-sm cursor-pointer"
                      >
                        This is my current engagement
                      </Label>
                    </div>

                    {/* End Date — hidden when current */}
                    {!oe.isCurrent && (
                      <div className="grid gap-1.5">
                        <Label className="text-text-secondary text-xs">End Date</Label>
                        <div className="flex gap-2">
                          <select
                            className={selectClass}
                            value={oe.endMonth ?? "June"}
                            onChange={(e) =>
                              updateOtherEngagement(oe.id, { endMonth: e.target.value })
                            }
                          >
                            {MONTHS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <select
                            className={selectClass}
                            value={oe.endYear ?? "2024"}
                            onChange={(e) =>
                              updateOtherEngagement(oe.id, { endYear: e.target.value })
                            }
                          >
                            {YEARS.map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    <div className="grid gap-1.5">
                      <Label className="text-text-secondary text-xs">Description</Label>
                      <Textarea
                        className={textareaClass}
                        value={oe.description}
                        onChange={(e) =>
                          updateOtherEngagement(oe.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Describe what you do / did here…"
                      />
                    </div>

                    {/* Achievements */}
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-text-secondary text-xs">
                          Achievements / Merits
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary/80 h-6 px-2 text-xs"
                          onClick={() =>
                            updateOtherEngagement(oe.id, {
                              achievements: [...oe.achievements, ""],
                            })
                          }
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Achievement/Merit
                        </Button>
                      </div>
                      {oe.achievements.map((ach, ai) => (
                        <div key={ai} className="flex items-start gap-2">
                          <Textarea
                            className={textareaClass + " flex-1 resize-y"}
                            value={ach}
                            onChange={(e) => {
                              const next = [...oe.achievements];
                              next[ai] = e.target.value;
                              updateOtherEngagement(oe.id, { achievements: next });
                            }}
                            placeholder="Describe the achievement / merit — add as much detail as you like…"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = oe.achievements.filter((_, i) => i !== ai);
                              updateOtherEngagement(oe.id, { achievements: next });
                            }}
                            className="text-destructive hover:text-red-400 transition-colors shrink-0 mt-2"
                            title="Remove achievement"
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
                      onClick={() => toggleExpand(oe.id)}
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
    </Card>
  );
}
