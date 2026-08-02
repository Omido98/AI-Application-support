import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus } from "lucide-react";
import type { Language, FluencyLevel } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FLUENCY_OPTIONS: FluencyLevel[] = [
  "Beginner",
  "Elementary",
  "Intermediate",
  "Upper Intermediate",
  "Advanced",
  "Fluent",
  "Native",
];

function createEmptyLanguage(): Language {
  return { id: crypto.randomUUID(), name: "", fluency: "Intermediate" };
}

const inputClass =
  "bg-field border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 h-9 transition-[border-color,box-shadow]";
const selectClass =
  "bg-field border border-border text-text-primary rounded-md px-3 py-1.5 text-sm appearance-none cursor-pointer transition-[border-color,box-shadow] hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";

export default function LanguagesSection() {
  const languages = useProfileStore((s) => s.languages);
  const addLanguage = useProfileStore((s) => s.addLanguage);
  const updateLanguage = useProfileStore((s) => s.updateLanguage);
  const removeLanguage = useProfileStore((s) => s.removeLanguage);

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">Languages</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => addLanguage(createEmptyLanguage())}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Language
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {languages.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No languages added yet. Click "Add Language" to get started.
          </p>
        )}

        {languages.map((lang) => (
          <div key={lang.id} className="flex items-center gap-2">
            <Input
              className={inputClass + " flex-1"}
              value={lang.name}
              onChange={(e) =>
                updateLanguage(lang.id, { name: e.target.value })
              }
              placeholder="e.g. English, Spanish, Mandarin"
            />
            <select
              className={selectClass + " w-44"}
              value={lang.fluency}
              onChange={(e) =>
                updateLanguage(lang.id, {
                  fluency: e.target.value as FluencyLevel,
                })
              }
            >
              {FLUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeLanguage(lang.id)}
              className="text-destructive hover:text-red-400 transition-colors shrink-0"
              title="Remove language"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
