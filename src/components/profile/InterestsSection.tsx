import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { Interest } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDeleteDialog, {
  type DeleteTarget,
} from "@/components/profile/ConfirmDeleteDialog";

function createEmptyInterest(): Interest {
  return { id: crypto.randomUUID(), name: "" };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";

export default function InterestsSection() {
  const interests = useProfileStore((s) => s.interests);
  const addInterest = useProfileStore((s) => s.addInterest);
  const updateInterest = useProfileStore((s) => s.updateInterest);
  const removeInterest = useProfileStore((s) => s.removeInterest);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  /** An empty interest deletes without confirmation. */
  const requestDelete = (interest: Interest) => {
    if (!interest.name.trim()) {
      removeInterest(interest.id);
      return;
    }
    setDeleteTarget({
      label: `the interest "${interest.name.trim()}"`,
      onConfirm: () => removeInterest(interest.id),
    });
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Interests</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addInterest(createEmptyInterest())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Interest
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {interests.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No interests added yet. Click "Add Interest" to get started.
          </p>
        )}

        {interests.map((interest) => (
          <div key={interest.id} className="flex items-center gap-2">
            <Input
              className={inputClass + " flex-1"}
              value={interest.name}
              onChange={(e) =>
                updateInterest(interest.id, { name: e.target.value })
              }
              placeholder="e.g. Photography, Open Source, Trail Running"
            />
            <button
              type="button"
              onClick={() => requestDelete(interest)}
              className="text-destructive hover:text-red-400 transition-colors shrink-0"
              title="Remove interest"
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