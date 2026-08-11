import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { Skill } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDeleteDialog, {
  type DeleteTarget,
} from "@/components/profile/ConfirmDeleteDialog";

function createEmptySkill(): Skill {
  return { id: crypto.randomUUID(), name: "" };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";

export default function SkillsSection() {
  const skills = useProfileStore((s) => s.skills);
  const addSkill = useProfileStore((s) => s.addSkill);
  const updateSkill = useProfileStore((s) => s.updateSkill);
  const removeSkill = useProfileStore((s) => s.removeSkill);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  /** An empty skill deletes without confirmation. */
  const requestDelete = (skill: Skill) => {
    if (!skill.name.trim()) {
      removeSkill(skill.id);
      return;
    }
    setDeleteTarget({
      label: `the skill "${skill.name.trim()}"`,
      onConfirm: () => removeSkill(skill.id),
    });
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">
          Professional Skills
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addSkill(createEmptySkill())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Professional Skill
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {skills.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No skills added yet. Click "Add Professional Skill" to get started.
          </p>
        )}

        {skills.map((skill) => (
          <div key={skill.id} className="flex items-center gap-2">
            <Input
              className={inputClass + " flex-1"}
              value={skill.name}
              onChange={(e) =>
                updateSkill(skill.id, { name: e.target.value })
              }
              placeholder="e.g. Python, Project Management, Data Analysis"
            />
            <button
              type="button"
              onClick={() => requestDelete(skill)}
              className="text-destructive hover:text-red-400 transition-colors shrink-0"
              title="Remove skill"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
      <ConfirmDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
