import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { CoverLetter } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function createEmptyCoverLetter(): CoverLetter {
  return {
    id: crypto.randomUUID(),
    content: "",
    addedAt: new Date().toISOString(),
  };
}

const textareaClass =
  "bg-[#14141f] border-border text-text-primary placeholder:text-text-muted focus-visible:ring-primary/50 min-h-[300px] transition-[border-color,box-shadow] hover:border-primary/30";

export default function CoverLettersSection() {
  const coverLetters = useProfileStore((s) => s.coverLetters);
  const addCoverLetter = useProfileStore((s) => s.addCoverLetter);
  const updateCoverLetter = useProfileStore((s) => s.updateCoverLetter);
  const removeCoverLetter = useProfileStore((s) => s.removeCoverLetter);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // New letter creation — start expanded
  const handleAdd = () => {
    const letter = createEmptyCoverLetter();
    addCoverLetter(letter);
    setExpanded((prev) => ({ ...prev, [letter.id]: true }));
  };

  return (
    <Card className="bg-surface border-border transition-[border-color] hover:border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-text-primary text-lg">
          Previous Cover Letters
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Cover Letter
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {coverLetters.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">
            No cover letters yet. Click "Add Cover Letter" to get started.
          </p>
        )}

        {coverLetters.map((cl) => {
          const isExpanded = expanded[cl.id] ?? false;
          const preview = cl.content.length > 100
            ? cl.content.slice(0, 100) + "…"
            : cl.content;

          return (
            <Card key={cl.id} className="bg-[#14141f] border-border relative overflow-visible transition-[border-color] hover:border-primary/20">
              <button
                type="button"
                onClick={() => removeCoverLetter(cl.id)}
                className="absolute top-3 right-3 text-destructive hover:text-red-400 transition-colors z-10"
                title="Remove cover letter"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <CardContent className="pt-6 pb-4">
                {!isExpanded ? (
                  <div>
                    <p className="text-text-secondary text-sm whitespace-pre-wrap">
                      {preview || (
                        <span className="text-text-muted italic">Empty cover letter</span>
                      )}
                    </p>
                    {cl.content.length > 100 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="text-primary px-0 h-auto mt-1"
                        onClick={() => toggleExpand(cl.id)}
                      >
                        Read more <ChevronDown className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <Textarea
                      className={textareaClass}
                      value={cl.content}
                      onChange={(e) =>
                        updateCoverLetter(cl.id, { content: e.target.value })
                      }
                      placeholder="Write or paste your cover letter here…"
                    />
                    <Button
                      variant="link"
                      size="sm"
                      className="text-text-muted hover:text-text-secondary px-0 h-auto mt-1"
                      onClick={() => toggleExpand(cl.id)}
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
