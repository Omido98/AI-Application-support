import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { Education } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = Array.from({ length: 31 }, (_, i) => String(2000 + i));

function createEmptyEducation(): Education {
  return {
    id: crypto.randomUUID(),
    school: "",
    degree: "",
    programName: "",
    major: "",
    startMonth: "September",
    startYear: "2024",
    endMonth: "June",
    endYear: "2028",
    finalGrade: "",
    courses: [],
    thesisTitle: "",
  };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";
const selectClass =
  "bg-field border border-border text-text-primary rounded-md px-3 py-1.5 text-sm appearance-none cursor-pointer transition-[border-color,box-shadow] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";

export default function EducationSection() {
  const education = useProfileStore((s) => s.education);
  const addEducation = useProfileStore((s) => s.addEducation);
  const updateEducation = useProfileStore((s) => s.updateEducation);
  const removeEducation = useProfileStore((s) => s.removeEducation);

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Education</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addEducation(createEmptyEducation())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Education
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {education.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No education entries yet. Click "Add Education" to get started.
          </p>
        )}

        {education.map((edu) => (
          <Card
            key={edu.id}
            className="bg-field border-border relative overflow-visible transition-[border-color] hover:border-primary/20"
          >
            {/* Trash button — top right */}
            <button
              type="button"
              onClick={() => removeEducation(edu.id)}
              className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
              title="Remove entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <CardContent className="pt-6 pb-4 space-y-4">
              {/* School */}
              <div className="grid gap-1.5">
                <Label className="text-text-secondary text-xs">School / University</Label>
                <Input
                  className={inputClass}
                  value={edu.school}
                  onChange={(e) => updateEducation(edu.id, { school: e.target.value })}
                  placeholder="e.g. University of Cambridge"
                />
              </div>

              {/* Degree + Program Name side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-text-secondary text-xs">Degree</Label>
                  <Input
                    className={inputClass}
                    value={edu.degree}
                    onChange={(e) => updateEducation(edu.id, { degree: e.target.value })}
                    placeholder="e.g. BSc, MSc, MPhil"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-text-secondary text-xs">Program Name</Label>
                  <Input
                    className={inputClass}
                    value={edu.programName}
                    onChange={(e) => updateEducation(edu.id, { programName: e.target.value })}
                    placeholder="e.g. Computer Science"
                  />
                </div>
              </div>

              {/* Major */}
              <div className="grid gap-1.5">
                <Label className="text-text-secondary text-xs">Major</Label>
                <Input
                  className={inputClass}
                  value={edu.major}
                  onChange={(e) => updateEducation(edu.id, { major: e.target.value })}
                  placeholder="e.g. Artificial Intelligence"
                />
              </div>

              {/* Start Date + End Date side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-text-secondary text-xs">Start Date</Label>
                  <div className="flex gap-2">
                    <select
                      className={selectClass}
                      value={edu.startMonth}
                      onChange={(e) => updateEducation(edu.id, { startMonth: e.target.value })}
                    >
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      value={edu.startYear}
                      onChange={(e) => updateEducation(edu.id, { startYear: e.target.value })}
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-text-secondary text-xs">End Date</Label>
                  <div className="flex gap-2">
                    <select
                      className={selectClass}
                      value={edu.endMonth}
                      onChange={(e) => updateEducation(edu.id, { endMonth: e.target.value })}
                    >
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      value={edu.endYear}
                      onChange={(e) => updateEducation(edu.id, { endYear: e.target.value })}
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Final Grade */}
              <div className="grid gap-1.5">
                <Label className="text-text-secondary text-xs">Final Grade</Label>
                <Input
                  className={inputClass}
                  value={edu.finalGrade}
                  onChange={(e) => updateEducation(edu.id, { finalGrade: e.target.value })}
                  placeholder="e.g. GPA 3.8/4.0, Distinction, Merit, 8.5/10"
                />
                <p className="text-text-muted text-[11px] leading-tight">
                  Enter your grade in any format, e.g. "GPA 3.8/4.0", "Distinction", "Merit", "8.5/10"
                </p>
              </div>

              {/* Courses */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-text-secondary text-xs">Courses / Modules</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary/80 h-6 px-2 text-xs"
                    onClick={() =>
                      updateEducation(edu.id, { courses: [...edu.courses, ""] })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Course
                  </Button>
                </div>
                {edu.courses.map((course, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <Input
                      className={inputClass + " flex-1"}
                      value={course}
                      onChange={(e) => {
                        const next = [...edu.courses];
                        next[ci] = e.target.value;
                        updateEducation(edu.id, { courses: next });
                      }}
                      placeholder="Course name"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = edu.courses.filter((_, i) => i !== ci);
                        updateEducation(edu.id, { courses: next });
                      }}
                      className="text-destructive hover:text-red-400 transition-colors shrink-0"
                      title="Remove course"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Thesis Title */}
              <div className="grid gap-1.5">
                <Label className="text-text-secondary text-xs">Thesis Title</Label>
                <Input
                  className={inputClass}
                  value={edu.thesisTitle}
                  onChange={(e) => updateEducation(edu.id, { thesisTitle: e.target.value })}
                  placeholder="Title of your thesis / dissertation"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
